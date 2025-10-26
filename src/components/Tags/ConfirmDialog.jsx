export default function ConfirmDialog({ open, title='Are you sure?', message, confirm='Delete', onConfirm, onCancel }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[210] bg-black/30 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-lg shadow p-4">
        <h3 className="text-base font-semibold mb-2">{title}</h3>
        {message && <p className="text-sm text-gray-600 mb-4">{message}</p>}
        <div className="flex justify-end gap-2">
          <button className="px-3 py-1 text-sm" onClick={onCancel}>Cancel</button>
          <button className="px-3 py-1 text-sm bg-red-600 text-white rounded" onClick={onConfirm}>{confirm}</button>
        </div>
      </div>
    </div>
  )
}
