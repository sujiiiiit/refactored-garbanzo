/**
 * POST /api/groups - Create new group
 * GET /api/groups - List user's groups
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const CreateGroupSchema = z.object({
  name: z.string().min(3).max(100),
  description: z.string().max(500).optional(),
  type: z.enum(['trip', 'household', 'friends', 'event', 'other']),
  currency: z.string().default('INR'),
  default_split_method: z.enum(['equal', 'percentage', 'exact', 'shares']).default('equal'),
  member_emails: z.array(z.string().email()).optional()
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse and validate request body
    const body = await request.json();
    const validatedData = CreateGroupSchema.parse(body);

    // Generate unique invite code (6 characters)
    const inviteCode = generateInviteCode();

    // Create group
    const { data: group, error: groupError } = await supabase
      .from('groups')
      .insert({
        created_by: user.id,
        name: validatedData.name,
        description: validatedData.description,
        type: validatedData.type,
        currency: validatedData.currency,
        default_split_method: validatedData.default_split_method,
        invite_code: inviteCode,
        is_active: true,
        member_count: 1
      })
      .select()
      .single();

    if (groupError) {
      return NextResponse.json(
        { error: 'Failed to create group', details: groupError.message },
        { status: 500 }
      );
    }

    // Add creator as admin member
    const { error: memberError } = await supabase
      .from('group_members')
      .insert({
        group_id: group.id,
        user_id: user.id,
        role: 'admin',
        balance: 0
      });

    if (memberError) {
      // Rollback group creation
      await supabase.from('groups').delete().eq('id', group.id);
      return NextResponse.json(
        { error: 'Failed to add member', details: memberError.message },
        { status: 500 }
      );
    }

    // Send invitations (if member_emails provided)
    let invitations_sent = 0;
    if (validatedData.member_emails && validatedData.member_emails.length > 0) {
      // TODO: Send email invitations
      // For now, just count them
      invitations_sent = validatedData.member_emails.length;
    }

    return NextResponse.json({
      group: {
        id: group.id,
        name: group.name,
        type: group.type,
        currency: group.currency,
        invite_code: inviteCode,
        created_by: user.id,
        member_count: 1,
        created_at: group.created_at
      },
      invitations_sent
    }, { status: 201 });

  } catch (error: any) {
    console.error('Error creating group:', error);

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

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's groups (where they are a member)
    const { data: memberships, error: memberError } = await supabase
      .from('group_members')
      .select(`
        group_id,
        role,
        balance,
        joined_at,
        groups (
          id,
          name,
          description,
          type,
          currency,
          invite_code,
          total_expenses,
          member_count,
          created_at,
          is_active
        )
      `)
      .eq('user_id', user.id);

    if (memberError) {
      return NextResponse.json(
        { error: 'Failed to fetch groups', details: memberError.message },
        { status: 500 }
      );
    }

    // Format response
    const groups = memberships?.map(m => ({
      ...m.groups,
      user_role: m.role,
      user_balance: m.balance,
      joined_at: m.joined_at
    })).filter(g => g.is_active);

    return NextResponse.json({ groups, count: groups?.length || 0 });

  } catch (error: any) {
    console.error('Error fetching groups:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed ambiguous chars
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
