import { useEffect, useMemo, useState } from 'react';
import { X, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

const SWATCHES = [
  '#ef4444','#f97316','#f59e0b','#eab308','#84cc16','#22c55e',
  '#10b981','#06b6d4','#0ea5e9','#3b82f6','#6366f1','#8b5cf6',
  '#a855f7','#d946ef','#ec4899','#f43f5e','#6b7280','#0f172a'
];
const randomSwatch = () => SWATCHES[Math.floor(Math.random() * SWATCHES.length)];

/**
 * TagEditorModal
 *
 * Props:
 * - open: boolean
 * - initial?: { id, name, color, section?: 'Workspace'|'Private', workspace_id?, private_space_id? }
 * - onClose(): void
 * - onSave(payload): void // payload = { name, color, section, workspaceId?, privateSpaceId? }
 *
 * - context: 'workspace' | 'private'   // <— REQUIRED to lock the section
 * - workspaces?: Array<{ id, name }>   // optional; if omitted, modal will lazy-load
 * - privateSpaces?: Array<{ id, name }> // optional; if omitted, modal will lazy-load
 * - initialWorkspaceId?: string
 * - initialPrivateSpaceId?: string|null
 * - allowAllPrivate?: boolean (default true) // whether “All Private Spaces” is an option
 */
export default function TagEditorModal({
  open,
  initial,
  onClose,
  onSave,
  context, // 'workspace' | 'private'
  workspaces: workspacesProp = [],
  privateSpaces: privateSpacesProp = [],
  initialWorkspaceId,
  initialPrivateSpaceId = null,
  allowAllPrivate = true,
  allowAllWorkspaces = false,
}) {
  const editing = !!initial?.id;
  const [applyAllWorkspaces, setApplyAllWorkspaces] = useState(false);
  const [applyAllPrivateSpaces, setApplyAllPrivateSpaces] = useState(false);

  // local lists (we’ll prefer props; if empty, lazy-load)
  const [workspaces, setWorkspaces] = useState(workspacesProp);
  const [privateSpaces, setPrivateSpaces] = useState(privateSpacesProp);

  // section is locked by context
  const lockedSection = context === 'workspace' ? 'Workspace' : 'Private';

  // state
  const [section, setSection] = useState(initial?.section || lockedSection);
  const [workspaceId, setWorkspaceId] = useState(initial?.workspace_id || initialWorkspaceId || workspacesProp[0]?.id || '');
  const [privateSpaceId, setPrivateSpaceId] = useState(
    initial?.private_space_id ?? initialPrivateSpaceId ?? privateSpacesProp[0]?.id ?? null
  );
  const [name, setName] = useState(initial?.name || '');
  const [color, setColor] = useState(initial?.color || randomSwatch());

  // lazy-load lists if not provided
  useEffect(() => { setWorkspaces(workspacesProp); }, [workspacesProp]);
  useEffect(() => { setPrivateSpaces(privateSpacesProp); }, [privateSpacesProp]);

  // load lists if needed
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        // Only fetch what we need
        if (context === 'workspace' && workspacesProp.length === 0) {
          const { data } = await supabase
            .from('workspaces')
            .select('id,name')
            .order('name', { ascending: true });
          setWorkspaces((data || []).map(w => ({ id: w.id, name: w.name || 'Workspace' })));
        }
        if (context === 'private' && privateSpacesProp.length === 0) {
          const { data: { user } = {} } = await supabase.auth.getUser();
          const uid = user?.id || null;
          const { data } = await supabase
            .from('private_spaces')
            .select('id,name')
            .eq('created_by', uid)
            .order('name', { ascending: true });
          setPrivateSpaces((data || []).map(ps => ({ id: ps.id, name: ps.name || 'Private Space' })));
        }
      } catch {/* ignore */}
    })();
  }, [open, context, workspacesProp.length, privateSpacesProp.length]);

  // reset on open/initial
  useEffect(() => {
    if (!open) return;
    setSection(initial?.section || lockedSection);
    setName(initial?.name || '');
    setColor(initial?.color || randomSwatch());
    setWorkspaceId(initial?.workspace_id || initialWorkspaceId || workspaces[0]?.id || '');
    setPrivateSpaceId(initial?.private_space_id ?? initialPrivateSpaceId ?? privateSpaces[0]?.id ?? null);
    setApplyAllWorkspaces(false);
    setApplyAllPrivateSpaces(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial, lockedSection, workspaces.length, privateSpaces.length]);

  const valid =
    name.trim().length > 0 &&
    (section === 'Workspace' ? !!workspaceId : true);

  const sectionHelp = useMemo(() => {
    return section === 'Workspace'
      ? 'Workspace tags are shared within the selected workspace.'
      : 'Private tags belong to your private space. Choose a specific space, or apply to all.';
  }, [section]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl ring-1 ring-black/5 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div>
            <h3 className="text-base font-bold text-gray-900">{editing ? 'Edit tag' : 'New tag'}</h3>
            <p className="text-xs text-gray-500">{sectionHelp}</p>
          </div>
          <button className="text-gray-400 hover:text-gray-600" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-4 space-y-4 text-sm text-gray-800">
          {/* Section (locked) */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={context !== 'workspace'}
              onClick={() => setSection('Workspace')}
              className={[
                'rounded-lg border px-3 py-2 text-sm',
                section === 'Workspace' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200',
                context !== 'workspace' ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'
              ].join(' ')}
            >
              Workspace
            </button>
            <button
              type="button"
              disabled={context !== 'private'}
              onClick={() => setSection('Private')}
              className={[
                'rounded-lg border px-3 py-2 text-sm',
                section === 'Private' ? 'border-fuchsia-500 bg-fuchsia-50 text-fuchsia-700' : 'border-gray-200',
                context !== 'private' ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'
              ].join(' ')}
            >
              Private
            </button>
          </div>

          {/* Target selector */}
          {section === 'Workspace' ? (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Workspace</label>
              <select
                value={workspaceId}
                onChange={(e) => setWorkspaceId(e.target.value)}
                disabled={allowAllWorkspaces && !editing && applyAllWorkspaces}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
              >
                {workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
              {allowAllWorkspaces && !editing && (
                <label className="mt-2 flex items-center gap-2 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={applyAllWorkspaces}
                    onChange={(e)=>setApplyAllWorkspaces(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  Create this tag in <b>all my workspaces</b>
                </label>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Private Space</label>
              <select
                value={privateSpaceId ?? ''}
                onChange={(e) => setPrivateSpaceId(e.target.value || null)}
                disabled={allowAllPrivate && !editing && applyAllPrivateSpaces}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-200"
              >
                {privateSpaces.map(ps => <option key={ps.id} value={ps.id}>{ps.name}</option>)}
              </select>
              {allowAllPrivate && !editing && (
                <label className="mt-2 flex items-center gap-2 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300"
                    checked={applyAllPrivateSpaces}
                    onChange={(e) => setApplyAllPrivateSpaces(e.target.checked)}
                  />
                  Create this tag in <b>all my private spaces</b>
                </label>
              )}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Tag name</label>
            <input
              value={name}
              onChange={(e)=>setName(e.target.value)}
              placeholder="e.g. Recruiting, Invoices, Personal"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>

          {/* Color */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Color</label>
            <div className="flex items-center gap-3">
              <span className="inline-block h-6 w-6 rounded-full ring-1 ring-black/10" style={{ background: color || '#e5e7eb' }} title={color} />
              <input
                value={color}
                onChange={(e)=>setColor(e.target.value)}
                placeholder="#a855f7"
                className="w-36 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
              <button
                type="button"
                onClick={() => setColor(randomSwatch())}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                title="Random color"
              >
                <RefreshCw size={14} /> Random
              </button>
            </div>

            <div className="mt-2 grid grid-cols-9 gap-1.5">
              {SWATCHES.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setColor(s)}
                  className={[
                    'h-7 rounded-md ring-1 ring-black/10',
                    s === color ? 'outline outline-2 outline-offset-2 outline-indigo-500' : ''
                  ].join(' ')}
                  style={{ background: s }}
                  aria-label={`Pick ${s}`}
                  title={s}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={() => {
              onSave?.({
                name: name.trim(),
                color: (color || '').trim() || null,
                section,
                workspaceId: section === 'Workspace' ? workspaceId : undefined,
                applyAllWorkspaces: section === 'Workspace' ? applyAllWorkspaces : undefined,
                privateSpaceId: section === 'Private' ? (privateSpaceId ?? null) : undefined,
                applyAllPrivateSpaces: section === 'Private' ? applyAllPrivateSpaces : undefined,
              });
            }}
            disabled={!valid}
            className={['px-3 py-1.5 rounded-lg text-sm text-white', valid ? 'bg-gray-900 hover:bg-black' : 'bg-gray-300 cursor-not-allowed'].join(' ')}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
