import { supabase as defaultClient } from './supabaseClient'
import { slugify } from '@/utils/tagUtils'

// --- READ ---
export async function listWorkspaceTags(workspaceId, client = defaultClient) {
  // Prefer RPC that enforces membership; falls back to view if needed.
  return await client.rpc('get_workspace_tag_usage', { p_workspace: workspaceId })
  // Or: return await client.from('workspace_tag_usage').select('*').eq('workspace_id', workspaceId).order('name')
}

// --- CREATE (generic) ---
// (unchanged) We preserve original casing in `name`. Uniqueness is handled by DB on name_ci.
export async function addTag({
  supabase = defaultClient,
  name,
  section,
  workspaceId = null,
  privateSpaceId = null,
  createdBy,
  color = null,
}) {
  const raw = String(name || '').trim();
  if (!raw) return { data: null, error: new Error('Empty tag name') };

  const slug = slugify(raw); // fine if your UI uses slug; DB uniqueness is on name_ci

  const payload = {
    name: raw,                 // preserve original casing
    slug,
    color: color || null,
    section,
    created_by: createdBy,
    workspace_id: section === 'Workspace' ? workspaceId : null,
    user_id:     section === 'Private'   ? createdBy   : null,
    private_space_id: section === 'Private' ? (privateSpaceId ?? null) : null,
  };

  // Fast path: insert. If unique violation, we’ll fetch existing.
  const ins = await supabase
    .from('vault_tags')
    .insert(payload)
    .select('id, name, slug, color, created_by, workspace_id, user_id, private_space_id, created_at')
    .single();

  if (!ins.error) return { data: ins.data, error: null };

  if (ins.error.code !== '23505') {
    return { data: null, error: ins.error };
  }

  // Duplicate → fetch existing row by scope + slug (or you can fetch by name_ci if you prefer)
  let query = supabase
    .from('vault_tags')
    .select('id, name, slug, color, created_by, workspace_id, user_id, private_space_id, created_at')
    .eq('slug', slug)
    .eq('section', section);

  if (section === 'Workspace') {
    query = query.eq('workspace_id', workspaceId);
  } else {
    query = query.eq('user_id', createdBy);
    if (privateSpaceId) query = query.eq('private_space_id', privateSpaceId);
    else query = query.is('private_space_id', null);
  }

  const existing = await query.maybeSingle();
  if (existing.error) return { data: null, error: existing.error };
  return { data: existing.data, error: null };
}

// --- Thin wrappers ---
export const addWorkspaceTag = (client, { name, workspaceId, userId, color }) =>
  addTag({ supabase: client ?? defaultClient, name, section: 'Workspace', workspaceId, createdBy: userId, color });

export const addPrivateTag = (client, { name, privateSpaceId, userId, color }) =>
  addTag({ supabase: client ?? defaultClient, name, section: 'Private', privateSpaceId, createdBy: userId, color });

// --- Update/Delete/Merge (unchanged) ---
export async function updateTag(id, patch, client = defaultClient) {
  const newPatch = { ...patch };
  if (patch.name) newPatch.slug = slugify(patch.name);
  return await client.from('vault_tags').update(newPatch).eq('id', id).select('*').single();
}
export async function deleteTag(id, client = defaultClient) {
  return await client.from('vault_tags').delete().eq('id', id);
}
export async function mergeWorkspaceTags({ fromId, toId, workspaceId }, client = defaultClient) {
  return await client.rpc('merge_workspace_tags', {
    p_workspace: workspaceId,
    p_from_id: fromId,
    p_to_id: toId,
  });
}

/* ---------- Case-insensitive dedupe in memory, but preserve original casing ---------- */

// If your DB has a generated column `name_ci text GENERATED ALWAYS AS (lower(name)) STORED`
// with a unique index on (workspace_id, name_ci), you can also use UPSERTs safely.
// Keeping both options here:

// A) UPSERT path (requires unique index on workspace_id,name_ci)
//    Good when you want a single round trip per tag and no 23505 juggling.
export async function upsertWorkspaceTag(supabase, { name, workspaceId, userId }) {
  return await supabase
    .from('vault_tags')
    .upsert(
      {
        name: String(name || '').trim(), // keep original casing
        section: 'Workspace',
        workspace_id: workspaceId,
        user_id: userId,
      },
      { onConflict: 'workspace_id,name_ci', ignoreDuplicates: true } // <<< IMPORTANT
    )
    .select()
    .maybeSingle();
}

// B) Persist a batch of pending tags AFTER a successful doc save
//    Dedupe case-insensitively but pass the first-seen original casing to the creator.
export async function persistPendingTags(supabase, workspaceId, userId, names = []) {
  const firstSeenByLower = new Map(); // lower -> original
  for (const n of names) {
    const orig = String(n || '').trim();
    if (!orig) continue;
    const key = orig.toLowerCase();
    if (!firstSeenByLower.has(key)) firstSeenByLower.set(key, orig);
  }
  const originals = Array.from(firstSeenByLower.values());

  // Choose ONE approach: addWorkspaceTag (insert-catch-select) OR upsertWorkspaceTag.
  // If your DB has the name_ci unique index, prefer UPSERT:
  await Promise.allSettled(
    originals.map((orig) =>
      upsertWorkspaceTag(supabase, { name: orig, workspaceId, userId })
      // or:
      // addWorkspaceTag(supabase, { name: orig, workspaceId, userId })
    )
  );
}

/* Optionally, the same idea for Private tags */
export async function persistPendingPrivateTags(supabase, privateSpaceId, userId, names = []) {
  const firstSeenByLower = new Map();
  for (const n of names) {
    const orig = String(n || '').trim();
    if (!orig) continue;
    const key = orig.toLowerCase();
    if (!firstSeenByLower.has(key)) firstSeenByLower.set(key, orig);
  }
  const originals = Array.from(firstSeenByLower.values());

  await Promise.allSettled(
    originals.map((orig) =>
      addPrivateTag(supabase, { name: orig, privateSpaceId, userId })
    )
  );
}