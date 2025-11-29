/**
 * POST /api/expenses/from-voice - Process voice recording for expense entry
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { voiceAgent } from '@/lib/agents/voice-agent';
import { autoClassifierAgent } from '@/lib/agents/auto-classifier-agent';

const MAX_AUDIO_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_DURATION_SECONDS = 60;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse form data
    const formData = await request.formData();
    const audio = formData.get('audio') as File;
    const language = formData.get('language') as string || 'en-IN';
    const group_id = formData.get('group_id') as string | null;

    if (!audio) {
      return NextResponse.json(
        { error: 'No audio file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    const validTypes = ['audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/m4a', 'audio/webm'];
    if (!validTypes.includes(audio.type)) {
      return NextResponse.json(
        { error: 'Invalid audio type. Supported: WAV, MP3, M4A, WebM' },
        { status: 400 }
      );
    }

    // Validate file size
    if (audio.size > MAX_AUDIO_SIZE) {
      return NextResponse.json(
        { error: 'Audio too large. Maximum size is 5MB.' },
        { status: 413 }
      );
    }

    // Upload audio to storage
    const fileName = `${user.id}/${crypto.randomUUID()}-${audio.name}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('voice-recordings')
      .upload(fileName, audio, {
        contentType: audio.type,
        cacheControl: '3600'
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload audio', details: uploadError.message },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('voice-recordings')
      .getPublicUrl(fileName);

    // Process voice asynchronously
    const job_id = crypto.randomUUID();

    processVoiceAsync(job_id, publicUrl, audio.type, language, user.id, group_id);

    // Return accepted response
    return NextResponse.json({
      job_id,
      status: 'processing',
      estimated_completion: new Date(Date.now() + 15000).toISOString(), // 15 seconds
      message: 'Voice recording uploaded. Transcribing...'
    }, { status: 202 });

  } catch (error: any) {
    console.error('Error processing voice:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}

// Background processing function
async function processVoiceAsync(
  jobId: string,
  audioUrl: string,
  audioFormat: string,
  language: string,
  userId: string,
  groupId: string | null
) {
  try {
    const supabase = await createClient();

    // Run voice agent
    const voiceResult = await voiceAgent.execute({
      audio_url: audioUrl,
      audio_format: audioFormat,
      language,
      user_id: userId,
      group_id: groupId || undefined
    }, {
      user_id: userId,
      session_id: jobId,
      request_id: jobId,
      metadata: {}
    });

    // If intent is to add expense and we have an amount
    if (
      voiceResult.intent === 'add_expense' &&
      voiceResult.extracted_expense.amount &&
      voiceResult.extracted_expense.confidence > 0.5
    ) {
      // Auto-classify
      const classification = await autoClassifierAgent.execute({
        description: voiceResult.extracted_expense.description || voiceResult.transcription.text,
        merchant_name: voiceResult.extracted_expense.merchant_name,
        amount: voiceResult.extracted_expense.amount,
        user_id: userId
      }, {
        user_id: userId,
        session_id: jobId,
        request_id: jobId,
        metadata: {}
      });

      // Create transaction
      await supabase.from('transactions').insert({
        user_id: userId,
        amount: voiceResult.extracted_expense.amount,
        currency: voiceResult.extracted_expense.currency,
        description: voiceResult.extracted_expense.description || voiceResult.transcription.text,
        merchant_name: voiceResult.extracted_expense.merchant_name,
        transaction_date: voiceResult.extracted_expense.date || new Date().toISOString().split('T')[0],
        category: classification.category,
        subcategory: classification.subcategory,
        group_id: groupId,
        source: 'voice',
        confidence_score: voiceResult.extracted_expense.confidence,
        raw_data: {
          transcription: voiceResult.transcription,
          extracted: voiceResult.extracted_expense
        },
        status: voiceResult.extracted_expense.confidence > 0.8 ? 'approved' : 'pending'
      });
    }

    // Store result (in production, this would be in Redis or a job status table)
    console.log('Voice processing completed:', jobId, voiceResult);

  } catch (error) {
    console.error('Background voice processing failed:', error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get job_id from query params
    const searchParams = request.nextUrl.searchParams;
    const job_id = searchParams.get('job_id');

    if (!job_id) {
      return NextResponse.json(
        { error: 'job_id is required' },
        { status: 400 }
      );
    }

    // In production, fetch from job status store (Redis/DB)
    // For now, check if transaction exists
    const { data: transaction } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .eq('source', 'voice')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (transaction) {
      return NextResponse.json({
        status: 'completed',
        transaction
      });
    }

    return NextResponse.json({
      status: 'processing'
    });

  } catch (error: any) {
    console.error('Error fetching voice job:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}
