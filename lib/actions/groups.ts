'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { 
  Group, 
  GroupMember, 
  CreateGroupRequest, 
  UpdateGroupRequest,
  GroupType 
} from '@/types';

/**
 * Get all groups for the current user
 */
export async function getGroups() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return { error: 'Not authenticated', data: null };
  }

  const { data, error } = await supabase
    .from('groups')
    .select(`
      *,
      group_members!inner (
        user_id,
        role
      )
    `)
    .eq('group_members.user_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) {
    return { error: error.message, data: null };
  }

  return { error: null, data };
}

/**
 * Get a single group by ID with members
 */
export async function getGroup(groupId: string) {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('groups')
    .select(`
      *,
      group_members (
        id,
        user_id,
        role,
        nickname,
        joined_at,
        profile:profiles (
          id,
          email,
          full_name,
          avatar_url
        )
      )
    `)
    .eq('id', groupId)
    .single();

  if (error) {
    return { error: error.message, data: null };
  }

  return { error: null, data };
}

/**
 * Get group by invite code
 */
export async function getGroupByInviteCode(inviteCode: string) {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('groups')
    .select('id, name, type, image_url, currency')
    .eq('invite_code', inviteCode.toUpperCase())
    .single();

  if (error) {
    return { error: 'Invalid invite code', data: null };
  }

  return { error: null, data };
}

/**
 * Create a new group
 */
export async function createGroup(input: CreateGroupRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return { error: 'Not authenticated', data: null };
  }

  // Create the group
  const { data: group, error: groupError } = await supabase
    .from('groups')
    .insert({
      name: input.name,
      description: input.description,
      type: input.type,
      image_url: input.image_url,
      currency: input.currency || 'USD',
      is_business: input.is_business || false,
      created_by: user.id,
    })
    .select()
    .single();

  if (groupError) {
    return { error: groupError.message, data: null };
  }

  // Add the creator as admin
  const { error: memberError } = await supabase
    .from('group_members')
    .insert({
      group_id: group.id,
      user_id: user.id,
      role: 'admin',
    });

  if (memberError) {
    // Rollback group creation
    await supabase.from('groups').delete().eq('id', group.id);
    return { error: memberError.message, data: null };
  }

  // Log activity
  await supabase.rpc('log_activity', {
    p_group_id: group.id,
    p_user_id: user.id,
    p_action: 'created_group',
    p_entity_type: 'group',
    p_entity_id: group.id,
    p_metadata: { name: group.name },
  });

  revalidatePath('/dashboard');
  revalidatePath('/groups');
  
  return { error: null, data: group };
}

/**
 * Update a group
 */
export async function updateGroup(groupId: string, input: UpdateGroupRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return { error: 'Not authenticated', data: null };
  }

  const { data, error } = await supabase
    .from('groups')
    .update({
      name: input.name,
      description: input.description,
      type: input.type,
      image_url: input.image_url,
      currency: input.currency,
    })
    .eq('id', groupId)
    .select()
    .single();

  if (error) {
    return { error: error.message, data: null };
  }

  revalidatePath(`/groups/${groupId}`);
  revalidatePath('/groups');
  
  return { error: null, data };
}

/**
 * Delete a group
 */
export async function deleteGroup(groupId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return { error: 'Not authenticated' };
  }

  const { error } = await supabase
    .from('groups')
    .delete()
    .eq('id', groupId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/dashboard');
  revalidatePath('/groups');
  
  return { error: null };
}

/**
 * Join a group using invite code
 */
export async function joinGroup(inviteCode: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return { error: 'Not authenticated', data: null };
  }

  // Find the group
  const { data: group, error: groupError } = await supabase
    .from('groups')
    .select('id, name')
    .eq('invite_code', inviteCode.toUpperCase())
    .single();

  if (groupError || !group) {
    return { error: 'Invalid invite code', data: null };
  }

  // Check if already a member
  const { data: existingMember } = await supabase
    .from('group_members')
    .select('id')
    .eq('group_id', group.id)
    .eq('user_id', user.id)
    .single();

  if (existingMember) {
    return { error: 'Already a member of this group', data: null };
  }

  // Add as member
  const { error: memberError } = await supabase
    .from('group_members')
    .insert({
      group_id: group.id,
      user_id: user.id,
      role: 'member',
    });

  if (memberError) {
    return { error: memberError.message, data: null };
  }

  // Log activity
  await supabase.rpc('log_activity', {
    p_group_id: group.id,
    p_user_id: user.id,
    p_action: 'joined_group',
    p_entity_type: 'group',
    p_entity_id: group.id,
    p_metadata: null,
  });

  revalidatePath('/dashboard');
  revalidatePath('/groups');
  
  return { error: null, data: group };
}

/**
 * Leave a group
 */
export async function leaveGroup(groupId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return { error: 'Not authenticated' };
  }

  // Check if user is the only admin
  const { data: admins } = await supabase
    .from('group_members')
    .select('user_id')
    .eq('group_id', groupId)
    .eq('role', 'admin');

  if (admins?.length === 1 && admins[0].user_id === user.id) {
    return { error: 'Cannot leave group as the only admin. Transfer admin role first.' };
  }

  const { error } = await supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/dashboard');
  revalidatePath('/groups');
  
  return { error: null };
}

/**
 * Add a member to a group
 */
export async function addGroupMember(groupId: string, email: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return { error: 'Not authenticated', data: null };
  }

  // Find user by email
  const { data: targetUser, error: userError } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email)
    .single();

  if (userError || !targetUser) {
    return { error: 'User not found', data: null };
  }

  // Check if already a member
  const { data: existingMember } = await supabase
    .from('group_members')
    .select('id')
    .eq('group_id', groupId)
    .eq('user_id', targetUser.id)
    .single();

  if (existingMember) {
    return { error: 'User is already a member', data: null };
  }

  // Add member
  const { data, error } = await supabase
    .from('group_members')
    .insert({
      group_id: groupId,
      user_id: targetUser.id,
      role: 'member',
    })
    .select()
    .single();

  if (error) {
    return { error: error.message, data: null };
  }

  revalidatePath(`/groups/${groupId}`);
  
  return { error: null, data };
}

/**
 * Remove a member from a group
 */
export async function removeGroupMember(groupId: string, memberId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return { error: 'Not authenticated' };
  }

  const { error } = await supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', memberId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/groups/${groupId}`);
  
  return { error: null };
}

/**
 * Update member role
 */
export async function updateMemberRole(
  groupId: string, 
  memberId: string, 
  role: 'admin' | 'member' | 'viewer'
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return { error: 'Not authenticated' };
  }

  const { error } = await supabase
    .from('group_members')
    .update({ role })
    .eq('group_id', groupId)
    .eq('user_id', memberId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/groups/${groupId}`);
  
  return { error: null };
}

/**
 * Generate new invite code for a group
 */
export async function regenerateInviteCode(groupId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return { error: 'Not authenticated', data: null };
  }

  // Generate new code using the database function
  const { data, error } = await supabase
    .rpc('generate_invite_code')
    .single();

  if (error) {
    return { error: error.message, data: null };
  }

  // Update the group
  const { data: group, error: updateError } = await supabase
    .from('groups')
    .update({ invite_code: data })
    .eq('id', groupId)
    .select('invite_code')
    .single();

  if (updateError) {
    return { error: updateError.message, data: null };
  }

  revalidatePath(`/groups/${groupId}`);
  
  return { error: null, data: group.invite_code };
}

/**
 * Get group balances
 */
export async function getGroupBalances(groupId: string) {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('group_balances')
    .select('*')
    .eq('group_id', groupId);

  if (error) {
    return { error: error.message, data: null };
  }

  return { error: null, data };
}

/**
 * Get group activity logs
 */
export async function getGroupActivity(groupId: string, limit: number = 20) {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('activity_logs')
    .select(`
      *,
      user:profiles (
        id,
        full_name,
        avatar_url
      )
    `)
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return { error: error.message, data: null };
  }

  return { error: null, data };
}
