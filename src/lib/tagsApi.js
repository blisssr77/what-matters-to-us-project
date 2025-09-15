import { supabase as defaultClient } from './supabaseClient'
import { slugify } from '@/utils/tagUtils'

// --- READ ---
export async function listWorkspaceTags(workspaceId, client = defaultClient) {
  // Prefer RPC that enforces membership; falls back to view if needed.
  return await client.rpc('get_workspace_tag_usage', { p_workspace: workspaceId })
  // Or: return await client.from('workspace_tag_usage').select('*').eq('workspace_id', workspaceId).order('name')
}

// --- CREATE (generic) ---
export async function addTag({
  supabase = defaultClient,       // allows override; defaults to imported client
  name,
  section,                        // 'Workspace' | 'Private'
  workspaceId = null,             // required for Workspace
  privateSpaceId = null,          // optional for Private
  createdBy,                      // auth user id
  color = null,
}) {
  const raw = String(name || '').trim()
  if (!raw) return { data: null, error: new Error('Empty tag name') }

  const slug = slugify(raw)

  // Build insert payload – DB trigger will also normalize, but we send slug to be explicit
  const payload = {
    name: raw,
    slug,
    color: color || null,
    section,
    created_by: createdBy,
    workspace_id: section === 'Workspace' ? workspaceId : null,
    user_id:     section === 'Private'   ? createdBy   : null,
    private_space_id: section === 'Private' ? (privateSpaceId ?? null) : null,
  }

  // Try insert first (fast path)
  const ins = await supabase
    .from('vault_tags')
    .insert(payload)
    .select('id, name, slug, color, created_by, workspace_id, user_id, private_space_id, created_at')
    .single()

  if (!ins.error) return { data: ins.data, error: null }

  // If not a unique violation, bubble it up
  if (ins.error.code !== '23505') {
    return { data: null, error: ins.error }
  }

  // Duplicate → fetch existing row by scope + slug
  let query = supabase
    .from('vault_tags')
    .select('id, name, slug, color, created_by, workspace_id, user_id, private_space_id, created_at')
    .eq('slug', slug)
    .eq('section', section)

  if (section === 'Workspace') {
    query = query.eq('workspace_id', workspaceId)
  } else {
    // private uniqueness: (user_id, COALESCE(private_space_id,'000…'), slug)
    // we’ll match by user_id + either exact privateSpaceId or NULL
    query = query.eq('user_id', createdBy)
    if (privateSpaceId) query = query.eq('private_space_id', privateSpaceId)
    else query = query.is('private_space_id', null)
  }

  const existing = await query.maybeSingle()
  if (existing.error) return { data: null, error: existing.error }
  return { data: existing.data, error: null }
}

// --- Thin wrappers (recommended imports in components) ---
export const addWorkspaceTag = (client, { name, workspaceId, userId, color }) =>
  addTag({ supabase: client ?? defaultClient, name, section: 'Workspace', workspaceId, createdBy: userId, color })

export const addPrivateTag = (client, { name, privateSpaceId, userId, color }) =>
  addTag({ supabase: client ?? defaultClient, name, section: 'Private', privateSpaceId, createdBy: userId, color })

// --- Legacy direct creator (okay to keep, but prefer addWorkspaceTag above) ---
export async function createWorkspaceTag({ name, color, workspaceId, userId }, client = defaultClient) {
  const slug = slugify(name)
  return await client.from('vault_tags').insert({
    name, slug, color: color || null,
    section: 'Workspace',
    workspace_id: workspaceId,
    created_by: userId,
  }).select('*').single()
}

// --- Update/Delete/Merge ---
export async function updateTag(id, patch, client = defaultClient) {
  const newPatch = { ...patch }
  if (patch.name) newPatch.slug = slugify(patch.name)
  return await client.from('vault_tags').update(newPatch).eq('id', id).select('*').single()
}

export async function deleteTag(id, client = defaultClient) {
  return await client.from('vault_tags').delete().eq('id', id)
}

export async function mergeWorkspaceTags({ fromId, toId, workspaceId }, client = defaultClient) {
  // Requires your RPC on the backend.
  return await client.rpc('merge_workspace_tags', {
    p_workspace: workspaceId,
    p_from_id: fromId,
    p_to_id: toId,
  })
}

export async function upsertWorkspaceTag(supabase, { name, workspaceId, userId }) {
  // Adjust onConflict to match your unique index. If you created a name_ci index, use 'workspace_id,name_ci'.
  return await supabase
    .from('vault_tags')
    .upsert(
      { name: name.trim(), section: 'Workspace', workspace_id: workspaceId, user_id: userId },
      { onConflict: 'workspace_id,name_ci', ignoreDuplicates: true }
    )
    .select()
    .maybeSingle();
}

export async function persistPendingTags(supabase, workspaceId, userId, names = []) {
  const uniques = Array.from(
    new Set(names.map(n => String(n).trim()).filter(Boolean).map(n => n.toLowerCase()))
  );
  // Upsert each (ignoreDuplicates means no 409s)
  await Promise.allSettled(
    uniques.map(lower =>
      upsertWorkspaceTag(supabase, { name: lower, workspaceId, userId })
    )
  );
}
