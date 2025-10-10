import { supabase } from '@/lib/supabaseClient'
import dayjs from 'dayjs'

/**
 * Global search.
 * NOTE:
 * - Uses simple ilike for titles/notes (fast enough with proper trigram/GIN indexes).
 * - Add indexes if needed:
 *   create index on workspace_vault_items using gin (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(notes,'')));
 *   create index on private_vault_items   using gin (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(notes,'')));
 */
export async function globalSearch(q, { limitPer = 5 } = {}) {
  const term = (q || '').trim()
  if (!term) return { wsDocs: [], pvDocs: [], wsCal: [], pvCal: [], tags: [] }

  const like = `%${term}%`

  // PARALLEL QUERIES (scoped by RLS automatically)
  const [
    wsDocsRes,
    pvDocsRes,
    wsCalRes,
    pvCalRes,
    tagsRes,
  ] = await Promise.all([
    supabase.from('workspace_vault_items')
      .select('id, title, notes, tags, file_metas, is_vaulted, workspace_id, created_at, start_at, end_at, all_day, calendar_enabled')
      .or(`title.ilike.${like},notes.ilike.${like},tags.cs.{${term}}`)
      .order('updated_at', { ascending: false })
      .limit(limitPer),

    supabase.from('private_vault_items')
      .select('id, title, notes, tags, file_metas, is_vaulted, private_space_id, created_at, start_at, end_at, all_day, calendar_enabled')
      .or(`title.ilike.${like},notes.ilike.${like},tags.cs.{${term}}`)
      .order('updated_at', { ascending: false })
      .limit(limitPer),

    supabase.from('workspace_calendar_items_secure')
      .select('id, title, calendar_title_masked, workspace_id, start_at, end_at, all_day, calendar_color')
      .or(`title.ilike.${like},calendar_title_masked.ilike.${like}`)
      .order('start_at', { ascending: false })
      .limit(limitPer),

    supabase.from('private_calendar_items_secure')
      .select('id, title, private_space_id, start_at, end_at, all_day, calendar_color')
      .or(`title.ilike.${like}`)
      .order('start_at', { ascending: false })
      .limit(limitPer),

    supabase.from('vault_tags')
      .select('id, name, slug, color, section, workspace_id, private_space_id')
      .ilike('name', like)
      .order('name', { ascending: true })
      .limit(limitPer),
  ])

  const pick = r => (r?.data && !r.error ? r.data : [])

  return {
    wsDocs: pick(wsDocsRes).map(d => ({ ...d, scope: 'workspace', kind: (Array.isArray(d.file_metas) && d.file_metas.length ? 'doc' : 'note') })),
    pvDocs: pick(pvDocsRes).map(d => ({ ...d, scope: 'private',   kind: (Array.isArray(d.file_metas) && d.file_metas.length ? 'doc' : 'note') })),
    wsCal : pick(wsCalRes).map(d => ({ ...d, scope: 'workspace' })),
    pvCal : pick(pvCalRes).map(d => ({ ...d, scope: 'private' })),
    tags  : pick(tagsRes),
  }
}

/** Small helpers used by the UI */
export function fmtWhen(start_at, end_at, all_day) {
  const s = start_at ? dayjs(start_at) : null
  const e = end_at ? dayjs(end_at) : null
  if (all_day) return s ? s.format('MMM D, YYYY') + ' (All day)' : 'All day'
  if (!s) return ''
  return `${s.format('MMM D, YYYY h:mm A')}${e ? ` – ${e.format('h:mm A')}` : ''}`
}
