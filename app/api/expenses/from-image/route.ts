/**
 * POST /api/expenses/from-image - Upload receipt image for OCR processing
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ocrAgent } from '@/lib/agents/ocr-agent';
import { autoClassifierAgent } from '@/lib/agents/auto-classifier-agent';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

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
    const image = formData.get('image') as File;
    const group_id = formData.get('group_id') as string | null;
    const user_notes = formData.get('user_notes') as string | null;

    if (!image) {
      return NextResponse.json(
        { error: 'No image file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (!validTypes.includes(image.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only JPEG, PNG, and PDF are allowed.' },
        { status: 400 }
      );
    }

    // Validate file size
    if (image.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 10MB.' },
        { status: 413 }
      );
    }

    // Upload image to storage
    const fileName = `${user.id}/${crypto.randomUUID()}-${image.name}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('receipts')
      .upload(fileName, image, {
        contentType: image.type,
        cacheControl: '3600'
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload image', details: uploadError.message },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('receipts')
      .getPublicUrl(fileName);

    // Create receipt record
    const { data: receipt, error: receiptError } = await supabase
      .from('receipts')
      .insert({
        user_id: user.id,
        file_url: publicUrl,
        file_type: image.type,
        file_size: image.size,
        processing_status: 'pending'
      })
      .select()
      .single();

    if (receiptError) {
      return NextResponse.json(
        { error: 'Failed to create receipt record', details: receiptError.message },
        { status: 500 }
      );
    }

    // Process OCR asynchronously (in production, this would be a background job)
    // For now, we'll do it synchronously but return immediately
    processReceiptAsync(receipt.id, publicUrl, image.type, user.id, group_id, user_notes);

    // Return accepted response
    return NextResponse.json({
      receipt_id: receipt.id,
      status: 'processing',
      estimated_completion: new Date(Date.now() + 30000).toISOString(), // 30 seconds
      message: 'Receipt uploaded successfully. Processing in background.'
    }, { status: 202 });

  } catch (error: any) {
    console.error('Error processing receipt:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}

// Background processing function
async function processReceiptAsync(
  receiptId: string,
  imageUrl: string,
  fileType: string,
  userId: string,
  groupId: string | null,
  userNotes: string | null
) {
  try {
    const supabase = await createClient();

    // Run OCR
    const ocrResult = await ocrAgent.execute({
      receipt_id: receiptId,
      image_url: imageUrl,
      file_type: fileType,
      user_id: userId
    }, {
      user_id: userId,
      session_id: crypto.randomUUID(),
      request_id: crypto.randomUUID(),
      metadata: {}
    });

    // If OCR successful and we have enough data, create transaction
    if (
      ocrResult.extracted_data.merchant_name &&
      ocrResult.extracted_data.total_amount &&
      ocrResult.ocr_confidence > 0.7
    ) {
      // Auto-classify
      const classification = await autoClassifierAgent.execute({
        description: ocrResult.extracted_data.merchant_name,
        merchant_name: ocrResult.extracted_data.merchant_name,
        amount: ocrResult.extracted_data.total_amount,
        user_id: userId
      }, {
        user_id: userId,
        session_id: crypto.randomUUID(),
        request_id: crypto.randomUUID(),
        metadata: {}
      });

      // Create transaction
      await supabase.from('transactions').insert({
        user_id: userId,
        amount: ocrResult.extracted_data.total_amount,
        currency: ocrResult.extracted_data.currency,
        description: `Receipt from ${ocrResult.extracted_data.merchant_name}`,
        merchant_name: ocrResult.extracted_data.merchant_name,
        transaction_date: ocrResult.extracted_data.transaction_date || new Date().toISOString().split('T')[0],
        category: classification.category,
        subcategory: classification.subcategory,
        gst_applicable: ocrResult.extracted_data.gst_details ? true : false,
        gst_amount: ocrResult.extracted_data.gst_details?.total_gst,
        receipt_id: receiptId,
        group_id: groupId,
        notes: userNotes,
        source: 'image',
        confidence_score: ocrResult.ocr_confidence,
        raw_data: ocrResult.extracted_data,
        status: ocrResult.ocr_confidence > 0.85 ? 'approved' : 'pending'
      });
    }

  } catch (error) {
    console.error('Background OCR processing failed:', error);
    // Update receipt status to failed
    const supabase = await createClient();
    await supabase
      .from('receipts')
      .update({
        processing_status: 'failed',
        processing_error: error instanceof Error ? error.message : 'Unknown error'
      })
      .eq('id', receiptId);
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

    // Get receipt_id from query params
    const searchParams = request.nextUrl.searchParams;
    const receipt_id = searchParams.get('receipt_id');

    if (!receipt_id) {
      return NextResponse.json(
        { error: 'receipt_id is required' },
        { status: 400 }
      );
    }

    // Fetch receipt status
    const { data: receipt, error: fetchError } = await supabase
      .from('receipts')
      .select('*')
      .eq('id', receipt_id)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !receipt) {
      return NextResponse.json(
        { error: 'Receipt not found' },
        { status: 404 }
      );
    }

    // If completed, also fetch the created transaction
    let transaction = null;
    if (receipt.processing_status === 'completed') {
      const { data: txn } = await supabase
        .from('transactions')
        .select('*')
        .eq('receipt_id', receipt_id)
        .single();
      transaction = txn;
    }

    return NextResponse.json({
      receipt,
      transaction,
      status: receipt.processing_status
    });

  } catch (error: any) {
    console.error('Error fetching receipt:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}
