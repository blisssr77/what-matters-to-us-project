import { useEffect, useMemo, useState } from 'react'
import Layout from '@/components/Layout/Layout'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import { listWorkspaceTags, createWorkspaceTag, updateTag, deleteTag } from '@/lib/tagsApi'
import TagEditorModal from '@/components/Tags/TagEditorModal'
import ConfirmDialog from '@/components/Tags/ConfirmDialog'
import { supabase } from '@/lib/supabaseClient'
import { ArrowUpDown, Plus, RefreshCw } from 'lucide-react'
import MergeTagsButton from '@/components/Tags/MergeWTagsButton'
import clsx from 'clsx'

export default function WorkspaceTags() {
  const { activeWorkspaceId } = useWorkspaceStore()

  const [rows, setRows] = useState([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editInitial, setEditInitial] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [error, setError] = useState('')

  const [selectedId, setSelectedId] = useState(null)
  const [sortBy, setSortBy] = useState('name') // 'name' | 'usage_count' | 'created_by_name' | 'workspace_name'
  const [sortDir, setSortDir] = useState('asc') // 'asc' | 'desc'

  // NEW: workspace list + filter
  const [workspaceList, setWorkspaceList] = useState([])
  const [wsFilterId, setWsFilterId] = useState('all') // 'all' | workspaceId

  // --- load tags across all workspaces you can see (RLS/RPC enforces membership)
  const loadTags = async () => {
    setLoading(true)
    setError('')
    const { data, error } = await listWorkspaceTags(null) // null => all workspaces (per RPC)
    if (error) setError(error.message || 'Failed to load tags')
    setRows(data || [])
    setLoading(false)
  }

  // --- load workspaces where current user is a member
  const loadWorkspaces = async () => {
    try {
      const { data: { user } = {} } = await supabase.auth.getUser()
      if (!user?.id) { setWorkspaceList([]); return }

      // join membership to workspaces
      const { data, error } = await supabase
        .from('workspace_members')
        .select(`
          workspace_id,
          workspaces!inner ( id, name )
        `)
        .eq('user_id', user.id)

      if (error) { setWorkspaceList([]); return }

      // de-dup
      const map = new Map()
      ;(data || []).forEach(r => {
        const w = r.workspaces
        if (w?.id) map.set(w.id, { id: w.id, name: w.name || 'Workspace' })
      })
      const list = [...map.values()].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      setWorkspaceList(list)

      // default filter = activeWorkspaceId if present, else 'all'
      if (activeWorkspaceId && list.some(w => w.id === activeWorkspaceId)) {
        setWsFilterId(activeWorkspaceId)
      } else {
        setWsFilterId('all')
      }
    } catch {
      setWorkspaceList([])
    }
  }

  useEffect(() => { loadWorkspaces() }, [activeWorkspaceId])
  useEffect(() => { loadTags() }, [activeWorkspaceId])

  // sorting toggle
  const toggleSort = (key) => {
    if (sortBy === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortBy(key); setSortDir('asc') }
  }

  // filtered + sorted rows
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()

    // workspace filter
    const byWs = wsFilterId === 'all'
      ? rows
      : rows.filter(r => r.workspace_id === wsFilterId)

    // search filter
    const base = s
      ? byWs.filter(r =>
          (r.name || '').toLowerCase().includes(s) ||
          (r.slug || '').toLowerCase().includes(s) ||
          (r.created_by_name || '').toLowerCase().includes(s) ||
          (r.workspace_name || '').toLowerCase().includes(s)
        )
      : byWs

    // sort
    const sorted = [...base].sort((a, b) => {
      const av = a[sortBy]
      const bv = b[sortBy]
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av
      }
      const as = (av ?? '').toString().toLowerCase()
      const bs = (bv ?? '').toString().toLowerCase()
      if (as < bs) return sortDir === 'asc' ? -1 : 1
      if (as > bs) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return sorted
  }, [rows, q, sortBy, sortDir, wsFilterId])

  // handlers
  const handleNew = () => { setEditInitial(null); setEditOpen(true) }
  const handleEdit = (tag) => { setEditInitial(tag); setEditOpen(true) }

  // save (create or update) — ALWAYS create in activeWorkspaceId
  const handleSave = async ({ name, color }) => {
    setEditOpen(false)
    const { data: { user } = {} } = await supabase.auth.getUser()
    if (!user?.id) { setError('Not signed in'); return }
    if (!activeWorkspaceId) { setError('No active workspace'); return }

    if (editInitial) {
      const { error } = await updateTag(editInitial.id, { name, color })
      if (error) setError(error.message)
      else loadTags()
    } else {
      const { error } = await createWorkspaceTag({
        name,
        color,
        workspaceId: activeWorkspaceId,
        userId: user.id
      })
      if (error) setError(error.message)
      else loadTags()
    }
  }

  // delete
  const handleDelete = async (tag) => setConfirm(tag)
  const confirmDelete = async () => {
    const tag = confirm; setConfirm(null)
    const { error } = await deleteTag(tag.id)
    if (error) setError(error.message)
    else loadTags()
  }

  return (
    <Layout>
      <div className="max-w-5xl mx-auto p-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-lg text-gray-800 font-bold">Workspace Tags</h1>
            <p className="text-sm text-gray-500">
              Organize and standardize tags used across your workspaces.
            </p>
          </div>
          <div className="flex items-center text-gray-500 gap-2">
            <button
              onClick={loadTags}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded border border-gray-300 text-sm bg-white hover:bg-gray-50"
              title="Reload"
            >
              <RefreshCw size={16} /> Reload
            </button>
            <MergeTagsButton
              className="text-gray-500 inline-flex items-center gap-2 px-3 py-1.5 rounded border border-gray-300 text-sm bg-white hover:bg-gray-50"
              workspaceId={activeWorkspaceId}
              selectedTagId={selectedId}
              tags={filtered}
              onMerged={loadTags}
            />
            <button
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded text-white text-sm bg-gradient-to-r from-indigo-800 via-purple-800 to-violet-900 hover:from-indigo-900 hover:to-purple-900 transition"
              onClick={handleNew}
              disabled={!activeWorkspaceId}
              title={!activeWorkspaceId ? 'Select a workspace first' : 'Create a new tag in this workspace'}
            >
              <Plus size={16} /> New tag
            </button>
          </div>
        </div>

        {/* NEW: Workspace pills filter */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <button
            className={clsx(
              'px-2.5 py-1 text-xs rounded-full border',
              wsFilterId === 'all'
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            )}
            onClick={() => setWsFilterId('all')}
          >
            All workspaces
          </button>
          {workspaceList.map(w => (
            <button
              key={w.id}
              className={clsx(
                'px-2.5 py-1 text-xs rounded-full border',
                wsFilterId === w.id
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              )}
              onClick={() => setWsFilterId(w.id)}
              title={w.id === activeWorkspaceId ? 'Active workspace' : undefined}
            >
              {w.name}{w.id === activeWorkspaceId ? ' • Active' : ''}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="mb-3">
          <input
            className="w-full max-w-sm border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            placeholder="Search tags…"
            value={q}
            onChange={(e)=>setQ(e.target.value)}
          />
        </div>

        {/* Table */}
        <div className="overflow-x-auto bg-white border rounded shadow-sm">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="w-10 p-2"></th>

                <th className="text-left font-bold text-gray-600 p-2">
                  <button
                    type="button"
                    onClick={() => toggleSort('name')}
                    className="inline-flex items-center gap-1 hover:underline"
                  >
                    TAG <ArrowUpDown className="inline-block" size={14} />
                  </button>
                </th>

                <th className="text-left font-bold text-gray-600 p-2">
                  <button
                    type="button"
                    onClick={() => toggleSort('usage_count')}
                    className="inline-flex items-center gap-1 hover:underline"
                  >
                    IN USE <ArrowUpDown className="inline-block" size={14} />
                  </button>
                </th>

                <th className="text-left font-bold text-gray-600 p-2">
                  <button
                    type="button"
                    onClick={() => toggleSort('created_by_name')}
                    className="inline-flex items-center gap-1 hover:underline"
                  >
                    CREATED BY <ArrowUpDown className="inline-block" size={14} />
                  </button>
                </th>

                <th className="text-left font-bold text-gray-600 p-2">
                  <button
                    type="button"
                    onClick={() => toggleSort('workspace_name')}
                    className="inline-flex items-center gap-1 hover:underline"
                  >
                    WORKSPACE <ArrowUpDown className="inline-block" size={14} />
                  </button>
                </th>

                <th className="text-right font-bold text-gray-600 p-2">ACTIONS</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr><td className="p-4 text-gray-500" colSpan={6}>Loading…</td></tr>
              ) : filtered.length ? (
                filtered.map(tag => (
                  <tr
                    key={tag.id}
                    className="hover:bg-gray-50 text-xs"
                    onClick={() => setSelectedId(tag.id)}
                  >
                    <td className="p-2 align-middle">
                      <input
                        type="radio"
                        name="tagSelect"
                        checked={selectedId === tag.id}
                        onChange={() => setSelectedId(tag.id)}
                        className="cursor-pointer"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>

                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block w-3 h-3 rounded"
                          style={{ backgroundColor: tag.color || '#e5e7eb' }}
                        />
                        <span className="text-gray-800">{tag.name}</span>
                      </div>
                    </td>

                    <td className="p-2 text-gray-700">{tag.usage_count ?? 0}</td>
                    <td className="p-2 text-gray-700">{tag.created_by_name || '—'}</td>
                    <td className="p-2 text-gray-700">{tag.workspace_name || '—'}</td>

                    <td className="p-2 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleEdit(tag); }}
                          className="px-2 py-1 text-xs rounded border text-gray-500 border-gray-300 hover:bg-gray-50"
                        >
                          Edit
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(tag); }}
                          className="px-2 py-1 text-xs rounded border border-gray-300 hover:bg-gray-50 text-red-700"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td className="p-6 text-gray-500" colSpan={6}>No tags yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
      </div>

      {/* Modals */}
      <TagEditorModal
        open={editOpen}
        initial={editInitial ? { ...editInitial, section: 'Workspace' } : null}
        onClose={() => setEditOpen(false)}
        onSave={({ name, color }) => handleSave({ name, color })}
        // Only allow creating in the CURRENT workspace on this page:
        workspaces={[
          ...(activeWorkspaceId
            ? [{ id: activeWorkspaceId, name: (workspaceList.find(w => w.id === activeWorkspaceId)?.name) || 'Current workspace' }]
            : []
          )
        ]}
        privateSpaces={[]}
        defaultSection="Workspace"
        initialWorkspaceId={activeWorkspaceId}
      />

      <ConfirmDialog
        open={!!confirm}
        title="Delete tag?"
        message="This cannot be undone. Tags in use cannot be deleted."
        confirm="Delete"
        onCancel={() => setConfirm(null)}
        onConfirm={confirmDelete}
      />
    </Layout>
  )
}
