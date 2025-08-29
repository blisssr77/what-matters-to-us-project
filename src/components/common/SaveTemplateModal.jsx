import React, { useEffect, useRef, useState } from 'react'

export default function SaveTemplateModal({
  open,
  onClose,
  onSubmit,            // async ({ name, visibility, source }) => void
  source = 'public',   // 'public' | 'private'
  defaultName = '',
  defaultVisibility = 'private', // 'private' | 'workspace'
  submitting = false,
}) {
  const [name, setName] = useState(defaultName)
  const [visibility, setVisibility] = useState(defaultVisibility)
  const dialogRef = useRef(null)

  useEffect(() => {
    if (open) {
      setName(defaultName || '')
      setVisibility(defaultVisibility || 'private')
      // focus the name input
      setTimeout(() => dialogRef.current?.querySelector('input')?.focus(), 0)
      // escape to close
      const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
      window.addEventListener('keydown', onKey)
      return () => window.removeEventListener('keydown', onKey)
    }
  }, [open, defaultName, defaultVisibility, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[999]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={submitting ? undefined : onClose}
      />
      {/* Dialog */}
      <div
        ref={dialogRef}
        className="absolute inset-0 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-template-title"
      >
        <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-gray-200">
          <div className="p-4 border-b">
            <h2 id="save-template-title" className="text-sm font-semibold text-gray-900">
              Save current as template
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              Source: {source === 'private' ? 'Private note (encrypted editor JSON)' : 'Public note'}
            </p>
          </div>

          <div className="p-4 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-800 mb-1">Template name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="text-gray-800 w-full border rounded-lg px-3 py-2 text-sm bg-white"
                placeholder="e.g., Meeting Notes · Client Follow-up"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-800 mb-1">Visibility</label>
              <div className="flex items-center gap-3">
                <label className="text-gray-800 inline-flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="visibility"
                    value="private"
                    checked={visibility === 'private'}
                    onChange={() => setVisibility('private')}
                  />
                  Private
                </label>
                <label className="text-gray-800 inline-flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="visibility"
                    value="workspace"
                    checked={visibility === 'workspace'}
                    onChange={() => setVisibility('workspace')}
                  />
                  Workspace
                </label>
              </div>
              <p className="text-[11px] text-gray-500 mt-1">
                Private makes it visible only to you. Workspace shares with members.
              </p>
            </div>
          </div>

          <div className="p-4 border-t flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-3 py-1.5 text-sm text-gray-600 rounded-xl border hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onSubmit?.({ name: name.trim(), visibility, source })}
              disabled={submitting || !name.trim()}
              className="btn-secondary px-3 py-1.5 text-sm rounded-lg"
            >
              {submitting ? 'Saving…' : 'Save template'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
