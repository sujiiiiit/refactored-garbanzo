/**
 * POST /api/groups/:id/join - Join group with invite code
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const JoinGroupSchema = z.object({
  invite_code: z.string().length(6)
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse and validate request body
    const body = await request.json();
    const validatedData = JoinGroupSchema.parse(body);

    // Get group by ID and invite code
    const { data: group, error: groupError } = await supabase
      .from('groups')
      .select('*')
      .eq('id', params.id)
      .eq('invite_code', validatedData.invite_code)
      .eq('is_active', true)
      .single();

    if (groupError || !group) {
      return NextResponse.json(
        { error: 'Invalid group or invite code' },
        { status: 404 }
      );
    }

    // Check if user is already a member
    const { data: existingMember } = await supabase
      .from('group_members')
      .select('id')
      .eq('group_id', params.id)
      .eq('user_id', user.id)
      .single();

    if (existingMember) {
      return NextResponse.json(
        { error: 'You are already a member of this group' },
        { status: 409 }
      );
    }

    // Add user as member
    const { data: member, error: memberError } = await supabase
      .from('group_members')
      .insert({
        group_id: params.id,
        user_id: user.id,
        role: 'member',
        balance: 0
      })
      .select()
      .single();

    if (memberError) {
      return NextResponse.json(
        { error: 'Failed to join group', details: memberError.message },
        { status: 500 }
      );
    }

    // Increment member count
    const { error: updateError } = await supabase
      .from('groups')
      .update({ member_count: group.member_count + 1 })
      .eq('id', params.id);

    if (updateError) {
      console.error('Failed to update member count:', updateError);
    }

    return NextResponse.json({
      group: {
        id: group.id,
        name: group.name,
        type: group.type,
        currency: group.currency,
        member_count: group.member_count + 1
      },
      member: {
        id: member.id,
        role: member.role,
        balance: member.balance,
        joined_at: member.joined_at
      }
    }, { status: 201 });

  } catch (error: any) {
    console.error('Error joining group:', error);

    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 422 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}
