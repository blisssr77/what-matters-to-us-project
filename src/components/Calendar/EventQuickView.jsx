import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { X, Edit, Eye, Lock, Globe, Users, ChevronDown, ChevronUp, ShieldCheck } from 'lucide-react';
import clsx from 'clsx';
import { useNavigate } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export default function EventQuickView({ event, canSeeVaulted = false, onClose }) {
  if (!event) return null;

  const navigate = useNavigate();
  const start = dayjs(event.start_at);
  const end   = event.end_at ? dayjs(event.end_at) : null;

  // ---- vault unlock state ----
  const [vaultCode, setVaultCode] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [unlockErr, setUnlockErr] = useState('');
  // persist unlock per scope to avoid re-prompting
  const storageKey =
    event.scope === 'workspace'
      ? `vault_ok:ws:${event.workspace_id}`
      : `vault_ok:private`;

  const [unlocked, setUnlocked] = useState(
    canSeeVaulted || (typeof window !== 'undefined' && sessionStorage.getItem(storageKey) === '1')
  );

  // ---- members (workspace or private) ----
  const [members, setMembers] = useState([]);
  const [showMembers, setShowMembers] = useState(false);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        // WORKSPACE members: join to profiles via the explicit FK alias
        if (event.scope === 'workspace' && event.workspace_id) {
          const { data, error } = await supabase
            .from('workspace_members')
            .select(`
              user_id,
              name,
              profiles:profiles!workspace_members_user_id_fkey (
                id, username, first_name
              )
            `)
            .eq('workspace_id', event.workspace_id);

          if (!alive) return;
          if (error) { console.warn('load workspace members failed:', error); setMembers([]); return; }

          const list = (data || []).map(r => ({
            id: r.user_id,
            username: r.profiles?.username ?? null,
            first_name: r.profiles?.first_name ?? null,
            fallback_name: r.name ?? null,
          }));
          setMembers(list);
          return;
        }

        // PRIVATE space: show owner (created_by) profile
        if (event.scope === 'private' && event.private_space_id) {
          const { data: ps, error: sErr } = await supabase
            .from('private_spaces')
            .select('created_by')
            .eq('id', event.private_space_id)
            .maybeSingle();

          if (sErr) { console.warn('load private space failed:', sErr); if (alive) setMembers([]); return; }

          const ownerId = ps?.created_by ?? event.created_by;
          if (!ownerId) { if (alive) setMembers([]); return; }

          const { data: prof, error: pErr } = await supabase
            .from('profiles')
            .select('id, username, first_name')
            .eq('id', ownerId)
            .maybeSingle();

          if (!alive) return;
          if (pErr) { console.warn('load owner profile failed:', pErr); setMembers([]); return; }

          setMembers(prof ? [prof] : []);
          return;
        }

        // Fallback
        if (alive) setMembers([]);
      } catch {
        if (alive) setMembers([]);
      }
    })();

    return () => { alive = false; };
  }, [event?.id, event?.scope, event?.workspace_id, event?.private_space_id, event?.created_by]);

  // ---- vault verify ----
  const verifyVault = async () => {
    try {
      setUnlockErr('');
      setUnlocking(true);
      const code = (vaultCode || '').trim();
      if (!code) { setUnlockErr('Enter your vault code.'); return; }

      let ok = false, rpcErr = null;

      if (event.scope === 'workspace') {
        const { data, error } = await supabase.rpc('verify_workspace_code', {
          p_workspace: event.workspace_id,
          p_code: code,
        });
        ok = !!data; rpcErr = error;
      } else {
        const { data, error } = await supabase.rpc('verify_user_private_code', { p_code: code });
        ok = !!data; rpcErr = error;
      }

      if (rpcErr) { setUnlockErr(rpcErr.message || 'Verification failed.'); return; }
      if (!ok)    { setUnlockErr('Incorrect code.'); return; }

      setUnlocked(true);
      if (typeof window !== 'undefined') sessionStorage.setItem(storageKey, '1');
    } finally {
      setUnlocking(false);
    }
  };

  // ---- chips & body ----
  const isPublic   = !event.is_vaulted;
  const scopeLabel = event.scope === 'workspace' ? 'Workspace' : 'Private';
  const scopeClass = event.scope === 'workspace'
    ? 'bg-blue-100 text-blue-700'
    : 'bg-fuchsia-100 text-fuchsia-700';

  const visibilityChip = isPublic
    ? { cls: 'bg-emerald-100 text-emerald-700', icon: <Globe size={12} />, text: 'Public' }
    : { cls: 'bg-slate-200 text-slate-700', icon: <Lock size={12} />,   text: 'Vaulted' };

  const publicBody = event.public_note || event.notes || event.summary || '';

  // Pick routes
  const base = event.scope === 'workspace' ? '/workspace/vaults' : '/privatespace/vaults';
  const kind = event.is_vaulted ? 'doc' : 'note';
  const viewHref = `${base}/${kind}-view/${event.id}`;
  const editHref = `${base}/${kind}-edit/${event.id}`;

  const memberCount = members.length || 0;

  const body = useMemo(() => {
    if (isPublic) {
      return publicBody
        ? <p className="text-sm text-gray-800 whitespace-pre-wrap">{publicBody}</p>
        : <p className="text-sm text-gray-500">No additional details.</p>;
    }
    // Vaulted
    if (!unlocked) {
      return (
        <div className="rounded-lg border bg-gray-50 p-3">
          <div className="flex items-center gap-2 text-sm text-gray-800 font-medium">
            <Lock size={16}/> This item is vaulted
          </div>
          <p className="text-xs text-gray-600 mt-1">
            Enter your {scopeLabel.toLowerCase()} vault code to unlock.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="password"
              value={vaultCode}
              onChange={(e) => setVaultCode(e.target.value)}
              placeholder="Vault code"
              className="w-40 rounded border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 text-gray-800"
            />
            <button
              onClick={verifyVault}
              disabled={unlocking}
              className={clsx(
                'inline-flex items-center gap-1 rounded px-2.5 py-1.5 text-sm text-white',
                unlocking ? 'bg-gray-400' : 'bg-gray-900 hover:bg-black'
              )}
            >
              <ShieldCheck size={14} /> {unlocking ? 'Verifying…' : 'Unlock'}
            </button>
          </div>
          {unlockErr && <div className="text-xs text-red-600 mt-1">{unlockErr}</div>}
        </div>
      );
    }
    // Unlocked (we don’t decrypt here; show a safe callout + route to doc)
    return (
      <div className="rounded-lg border bg-amber-50 p-3">
        <div className="flex items-center gap-2 text-sm text-amber-900 font-medium">
          <ShieldCheck size={16}/> Unlocked
        </div>
        <p className="text-xs text-amber-800 mt-1">
          Open the document to view the private content.
        </p>
      </div>
    );
  }, [isPublic, unlocked, vaultCode, unlocking, unlockErr, scopeLabel, publicBody]);

  // Pick best label for a person
  const asHandle = (m) =>
    m?.username ? `@${m.username}` : (m?.first_name || m?.fallback_name || 'member');

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center p-4">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-xl ring-1 ring-black/5 overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b flex items-start gap-3">
          <div
            className="h-4 w-4 rounded-full mt-1 shrink-0"
            style={{ background: event.color || '#2563eb' }}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-gray-900 truncate">{event.title || 'Untitled'}</h3>
              <span className={clsx('text-[10px] px-1.5 py-[1px] rounded-full', scopeClass)}>
                {scopeLabel}
              </span>
              <span className={clsx('inline-flex items-center gap-1 text-[10px] px-1.5 py-[1px] rounded-full', visibilityChip.cls)}>
                {visibilityChip.icon} {visibilityChip.text}
              </span>
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              {start.format('ddd, MMM D, h:mm a')}
              {end ? ` – ${end.format('h:mm a')}` : ''}
              {event.all_day ? ' (all day)' : ''}
            </div>
          </div>

          <button onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3">
          {/* Public note (if exists and even if vaulted—we show it separately) */}
          {publicBody ? (
            <div className="rounded-lg border bg-white p-3">
              <div className="text-xs font-semibold text-gray-600 mb-1">Public note</div>
              <div className="text-sm text-gray-800 whitespace-pre-wrap">{publicBody}</div>
            </div>
          ) : null}

          {/* Vaulted section or unlocked callout */}
          {!isPublic && body}

          {/* Tags */}
          {(event.tags?.length ? (
            <div className="flex flex-wrap gap-2">
              {event.tags.map((t) => (
                <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 border">
                  #{t}
                </span>
              ))}
            </div>
          ) : null)}

          {/* Members */}
          <div className="rounded-lg border bg-white p-3">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-gray-600" />
              <div className="text-sm font-medium text-gray-800">
                {memberCount} member{memberCount === 1 ? '' : 's'}
              </div>
              {memberCount > 0 && (
                <button
                  className="ml-auto text-xs inline-flex items-center gap-1 px-2 py-1 rounded border hover:bg-gray-50 text-gray-700"
                  onClick={() => setShowMembers((v) => !v)}
                >
                  {showMembers ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  {showMembers ? 'Hide' : 'Show'}
                </button>
              )}
            </div>
            {showMembers && (
              <ul className="mt-2 space-y-1">
                {members.map((m) => (
                  <li key={m.id || m.username || m.first_name} className="text-xs text-gray-700">
                    {asHandle(m)}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <a
              href={viewHref}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-gray-900 text-white hover:bg-black text-sm"
              onClick={(e) => {
                e.preventDefault();
                navigate(viewHref);
              }}
            >
              <Eye size={16} /> View
            </a>

            <a
              href={editHref}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded border hover:bg-gray-50 text-sm text-gray-800"
              onClick={(e) => {
                e.preventDefault();
                navigate(editHref);
              }}
            >
              <Edit size={16} /> Edit
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}