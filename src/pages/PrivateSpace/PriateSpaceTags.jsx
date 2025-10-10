import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout/Layout';
import { usePrivateSpaceStore } from '@/store/usePrivateSpaceStore';
import {
  listPrivateTags,
  createPrivateTag,
  updateTag,
  deleteTag,
} from '@/lib/tagsApi';
import TagEditorModal from '@/components/Tags/TagEditorModal';
import ConfirmDialog from '@/components/Tags/ConfirmDialog';
import { supabase } from '@/lib/supabaseClient';
import { ArrowUpDown, Plus, RefreshCw } from 'lucide-react';
import MergePTagsButton from '@/components/Tags/MergePTagsButton';
import clsx from 'clsx';

export default function PrivateSpaceTags() {
  const { activeSpaceId } = usePrivateSpaceStore();

  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editInitial, setEditInitial] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [error, setError] = useState('');

  const [selectedId, setSelectedId] = useState(null);
  const [sortBy, setSortBy] = useState('name'); // 'name' | 'usage_count' | 'created_by_name' | 'space'
  const [sortDir, setSortDir] = useState('asc');

  // NEW: private space list + filter
  const [privateSpaceList, setPrivateSpaceList] = useState([]);
  const [psFilterId, setPsFilterId] = useState('all'); // 'all' | private_space_id

  // --- load tags (all spaces for this user; server filters by user via RPC)
  const loadTags = async () => {
    setLoading(true);
    setError('');

    const { data: { user } = {} } = await supabase.auth.getUser();
    if (!user?.id) {
      setRows([]);
      setError('Not signed in');
      setLoading(false);
      return;
    }
    // pass spaceId = null to get ALL user’s private-space tags
    const { data, error } = await listPrivateTags(user.id, null);
    if (error) setError(error.message || 'Failed to load tags');
    setRows(data || []);
    setLoading(false);
  };

  // --- load private spaces for the current user
  const loadPrivateSpaces = async () => {
    try {
      const { data: { user } = {} } = await supabase.auth.getUser();
      if (!user?.id) { setPrivateSpaceList([]); return; }

      const { data, error } = await supabase
        .from('private_spaces')
        .select('id, name')
        .eq('created_by', user.id)
        .order('name', { ascending: true });

      if (error) { setPrivateSpaceList([]); return; }

      const list = (data || []).map(s => ({ id: s.id, name: s.name || 'Private Space' }));
      setPrivateSpaceList(list);

      // default pill selection = activeSpaceId if available
      if (activeSpaceId && list.some(s => s.id === activeSpaceId)) {
        setPsFilterId(activeSpaceId);
      } else {
        setPsFilterId('all');
      }
    } catch {
      setPrivateSpaceList([]);
    }
  };

  useEffect(() => { loadPrivateSpaces(); }, [activeSpaceId]);
  useEffect(() => { loadTags(); }, [activeSpaceId]);

  // sorting toggle
  const toggleSort = (key) => {
    if (sortBy === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(key); setSortDir('asc'); }
  };

  // filtered + sorted rows (by pill + search)
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();

    // pill filter by private space
    const bySpace = psFilterId === 'all'
      ? rows
      : rows.filter(r => r.private_space_id === psFilterId);

    // search filter
    const base = s
      ? bySpace.filter(r =>
          (r.name || '').toLowerCase().includes(s) ||
          (r.slug || '').toLowerCase().includes(s) ||
          (r.created_by_name || '').toLowerCase().includes(s) ||
          (r.space_name || '').toLowerCase().includes(s)
        )
      : bySpace;

    // sort accessor
    const readSortField = (r) => (sortBy === 'space' ? (r.space_name || '') : r[sortBy]);

    // sort
    const sorted = [...base].sort((a, b) => {
      const av = readSortField(a);
      const bv = readSortField(b);
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      const as = (av ?? '').toString().toLowerCase();
      const bs = (bv ?? '').toString().toLowerCase();
      if (as < bs) return sortDir === 'asc' ? -1 : 1;
      if (as > bs) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [rows, q, sortBy, sortDir, psFilterId]);

  // handlers
  const handleNew  = () => { setEditInitial(null); setEditOpen(true); };
  const handleEdit = (tag) => { setEditInitial(tag); setEditOpen(true); };

  // create or update — ALWAYS create in the active private space
  const handleSave = async ({ name, color }) => {
    setEditOpen(false);
    const { data: { user } = {} } = await supabase.auth.getUser();
    if (!user?.id) { setError('Not signed in'); return; }
    if (!activeSpaceId) { setError('No active private space'); return; }

    if (editInitial) {
      const { error } = await updateTag(editInitial.id, { name, color });
      if (error) setError(error.message);
      else loadTags();
    } else {
      const { error } = await createPrivateTag({
        name,
        color,
        privateSpaceId: activeSpaceId,
        userId: user.id,
      });
      if (error) setError(error.message);
      else loadTags();
    }
  };

  // delete
  const handleDelete = async (tag) => setConfirm(tag);
  const confirmDelete = async () => {
    const tag = confirm; setConfirm(null);
    const { error } = await deleteTag(tag.id);
    if (error) setError(error.message);
    else loadTags();
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto p-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-lg text-gray-800 font-bold">Private Space Tags</h1>
            <p className="text-sm text-gray-500">Organize and standardize tags across your private spaces.</p>
          </div>
          <div className="flex items-center text-gray-500 gap-2">
            <button
              onClick={loadTags}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded border border-gray-300 text-sm bg-white hover:bg-gray-50"
              title="Reload"
            >
              <RefreshCw size={16} /> Reload
            </button>

            {/* Make sure your MergePTagsButton accepts `userId` and optional `privateSpaceId` */}
            <MergePTagsButton
              className="text-gray-500 inline-flex items-center gap-2 px-3 py-1.5 rounded border border-gray-300 text-sm bg-white hover:bg-gray-50"
              // For private tags, scope by user and (optionally) by activeSpaceId
              userId={(supabase.auth.getUser()).data?.user?.id || null}
              privateSpaceId={activeSpaceId || null}
              selectedTagId={selectedId}
              tags={filtered}
              onMerged={loadTags}
            />

            <button
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded text-white text-sm bg-gradient-to-r from-indigo-800 via-purple-800 to-violet-900 hover:from-indigo-900 hover:to-purple-900 transition"
              onClick={handleNew}
              disabled={!activeSpaceId}
              title={!activeSpaceId ? 'Select a private space first' : 'Create a new tag in this private space'}
            >
              <Plus size={16} /> New tag
            </button>
          </div>
        </div>

        {/* NEW: Private space pills filter */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <button
            className={clsx(
              'px-2.5 py-1 text-xs rounded-full border',
              psFilterId === 'all'
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            )}
            onClick={() => setPsFilterId('all')}
          >
            All spaces
          </button>
          {privateSpaceList.map(ps => (
            <button
              key={ps.id}
              className={clsx(
                'px-2.5 py-1 text-xs rounded-full border',
                psFilterId === ps.id
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              )}
              onClick={() => setPsFilterId(ps.id)}
              title={ps.id === activeSpaceId ? 'Active private space' : undefined}
            >
              {ps.name}{ps.id === activeSpaceId ? ' • Active' : ''}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="mb-3">
          <input
            className="w-full max-w-sm border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            placeholder="Search tags…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {/* Table */}
        <div className="overflow-x-auto bg-white border rounded shadow-sm">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="w-10 p-2" />
                <th className="text-left font-bold text-gray-600 p-2">
                  <button type="button" onClick={() => toggleSort('name')} className="inline-flex items-center gap-1 hover:underline">
                    TAG <ArrowUpDown className="inline-block" size={14} />
                  </button>
                </th>
                <th className="text-left font-bold text-gray-600 p-2">
                  <button type="button" onClick={() => toggleSort('usage_count')} className="inline-flex items-center gap-1 hover:underline">
                    IN USE <ArrowUpDown className="inline-block" size={14} />
                  </button>
                </th>
                <th className="text-left font-bold text-gray-600 p-2">
                  <button type="button" onClick={() => toggleSort('created_by_name')} className="inline-flex items-center gap-1 hover:underline">
                    CREATED BY <ArrowUpDown className="inline-block" size={14} />
                  </button>
                </th>
                <th className="text-left font-bold text-gray-600 p-2">
                  <button type="button" onClick={() => toggleSort('space')} className="inline-flex items-center gap-1 hover:underline">
                    PRIVATE SPACE <ArrowUpDown className="inline-block" size={14} />
                  </button>
                </th>
                <th className="text-right font-bold text-gray-600 p-2">ACTIONS</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td className="p-4 text-gray-500" colSpan={6}>Loading…</td>
                </tr>
              ) : filtered.length ? (
                filtered.map((tag) => (
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
                        <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: tag.color || '#e5e7eb' }} />
                        <span className="text-gray-800">{tag.name}</span>
                      </div>
                    </td>

                    <td className="p-2 text-gray-700">{tag.usage_count ?? 0}</td>
                    <td className="p-2 text-gray-700">{tag.created_by_name || '—'}</td>
                    <td className="p-2 text-gray-700">{tag.space_name || '—'}</td>

                    <td className="p-2 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleEdit(tag); }}
                          className="px-2 py-1 text-xs text-gray-500 rounded border border-gray-300 hover:bg-gray-50"
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

      {/* Modal: restrict creation to ACTIVE private space */}
      <TagEditorModal
        open={editOpen}
        initial={editInitial ? { ...editInitial, section: 'Private' } : null}
        onClose={() => setEditOpen(false)}
        onSave={({ name, color }) => handleSave({ name, color })}
        workspaces={[]}
        privateSpaces={[
          ...(activeSpaceId
            ? [{ id: activeSpaceId, name: (privateSpaceList.find(ps => ps.id === activeSpaceId)?.name) || 'Current private space' }]
            : []
          )
        ]}
        defaultSection="Private"
        initialPrivateSpaceId={activeSpaceId}
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
  );
}
