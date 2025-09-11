import { useMemo } from 'react'
import dayjs from 'dayjs'
import { X, Edit } from 'lucide-react'
import clsx from 'clsx'

export default function EventQuickView({ event, canSeeVaulted, onEdit, onClose }) {
  if (!event) return null;
  const start = dayjs(event.start_at);
  const end   = event.end_at ? dayjs(event.end_at) : null;

  const body = useMemo(() => {
    if (event.is_vaulted && !canSeeVaulted) {
      return (
        <p className="text-sm text-gray-600">
          This is a vaulted item. Title is visible; content is masked.
        </p>
      );
    }
    // Show a tasteful excerpt when public
    if (event.public_note) {
      return <p className="text-sm text-gray-700 whitespace-pre-wrap">{event.public_note}</p>;
    }
    return <p className="text-sm text-gray-500">No additional details.</p>;
  }, [event, canSeeVaulted]);

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center p-4">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-xl ring-1 ring-black/5">
        <div className="p-4 border-b flex items-start gap-3">
          <div className="h-4 w-4 rounded-full mt-1 shrink-0" style={{ background: event.color || '#2563eb' }} />
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-900 truncate">{event.title}</h3>
            <div className="text-xs text-gray-500">
              {start.format('ddd, MMM D, h:mm a')}
              {end ? ` – ${end.format('h:mm a')}` : ''}
              {event.all_day ? ' (all day)' : ''}
            </div>
          </div>
          <button onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="p-4 space-y-3">
          {body}

          <div className="flex flex-wrap gap-2">
            {(event.tags || []).map(t => (
              <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 border">
                #{t}
              </span>
            ))}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              onClick={() => onEdit?.(event)}
              className={clsx(
                'btn-secondary inline-flex items-center gap-2 px-3 py-1.5 rounded'
              )}
            >
              <Edit size={16} /> Edit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
