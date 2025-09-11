import { useState, useMemo, useEffect, useRef } from 'react'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import tzPlugin from 'dayjs/plugin/timezone'
dayjs.extend(utc)
dayjs.extend(tzPlugin)

const COLORS = ['#2563eb','#0ea5e9','#10b981','#f59e0b','#ef4444','#7c3aed','#6b7280']

// Convert date + time to ISO in the user's TZ
export function toISO({ date, time = '00:00', allDay, tz }) {
  if (!date) return null
  const base = time
    ? dayjs.tz(`${date} ${time}`, 'YYYY-MM-DD HH:mm', tz)
    : dayjs.tz(`${date}`, 'YYYY-MM-DD', tz)
  return (allDay ? base.startOf('day') : base).toISOString()
}

export default function AddToCalendar({
  initial = {},              // { calendar_enabled, start_at, end_at, all_day, ... }
  defaultColor = '#2563eb',
  isVaulted = false,
  onChange,
}) {
  const tz = dayjs.tz.guess()

  // --- local UI state
  const [enabled, setEnabled]     = useState(false)
  const [allDay, setAllDay]       = useState(false)
  const [color, setColor]         = useState(isVaulted ? '#7c3aed' : defaultColor)
  const [status, setStatus]       = useState('')
  const [visibility, setVis]      = useState(isVaulted ? 'masked' : 'public')
  const [startDate, setStartDate] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [endDate, setEndDate]     = useState('')
  const [endTime, setEndTime]     = useState('10:00')

  // guard: once user interacts, don't auto-reinit from props
  const userDirty = useRef(false)

  // mark dirty whenever user changes anything
  const wrap = (setter) => (v) => { userDirty.current = true; setter(v) }

  // Compute a stable key for "did initial change?"
  const initialKey = useMemo(() => JSON.stringify(initial ?? {}), [initial])

  // Re-initialize from `initial` only when it truly changes AND user hasn't touched UI
  useEffect(() => {
    if (userDirty.current) return

    const initEnabled =
      'calendar_enabled' in initial
        ? !!initial.calendar_enabled
        : !!initial.enabled

    const initAllDay = !!(initial.all_day ?? initial.allDay)
    const initColor  = initial.calendar_color ?? initial.color ?? (isVaulted ? '#7c3aed' : defaultColor)
    const initStatus = initial.calendar_status ?? initial.status ?? ''
    const initVis    = initial.calendar_visibility ?? initial.visibility ?? (isVaulted ? 'masked' : 'public')

    const sDate = initial.start_at
      ? dayjs(initial.start_at).tz(tz).format('YYYY-MM-DD')
      : ''
    const sTime = initial.start_at && !initAllDay
      ? dayjs(initial.start_at).tz(tz).format('HH:mm')
      : '09:00'

    const eDate = initial.end_at
      ? dayjs(initial.end_at).tz(tz).format('YYYY-MM-DD')
      : ''
    const eTime = initial.end_at && !initAllDay
      ? dayjs(initial.end_at).tz(tz).format('HH:mm')
      : '10:00'

    setEnabled(initEnabled)
    setAllDay(initAllDay)
    setColor(initColor)
    setStatus(initStatus)
    setVis(initVis)
    setStartDate(sDate)
    setStartTime(sTime)
    setEndDate(eDate)
    setEndTime(eTime)
  }, [initialKey, isVaulted, defaultColor, tz])

  // Build normalized payload for parent (pure calc)
  const payload = useMemo(() => {
    if (!enabled) return null
    const startISO = toISO({ date: startDate, time: allDay ? '00:00' : startTime, allDay, tz })
    const endISO   = endDate ? toISO({ date: endDate, time: allDay ? '23:59' : endTime, allDay, tz }) : null
    return {
      calendar_enabled: true,
      start_at: startISO,
      end_at: endISO,
      all_day: !!allDay,
      calendar_color: color || null,
      calendar_status: status || null,
      calendar_visibility: visibility || (isVaulted ? 'masked' : 'public'),
      // (add recurrence/window here if you use them on this screen)
    }
  }, [enabled, allDay, startDate, startTime, endDate, endTime, color, status, visibility, isVaulted, tz])

  // Notify parent AFTER render
  useEffect(() => {
    onChange?.(payload)
  }, [payload, onChange])

  return (
    <div className="rounded border p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-bold text-sm text-gray-800">Add to calendar</div>
        <label className="inline-flex items-center text-blue-800 gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(e)=>wrap(setEnabled)(e.target.checked)} />
          Enable
        </label>
      </div>

      {enabled && (
        <>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={allDay} onChange={(e)=>wrap(setAllDay)(e.target.checked)} />
            All day
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-xs text-gray-500 block">Start</label>
              <div className="flex gap-2">
                <input
                  type="date"
                  className="border rounded px-2 py-1 text-sm w-full text-gray-700"
                  value={startDate}
                  onChange={(e)=>wrap(setStartDate)(e.target.value)}
                />
                {!allDay && (
                  <input
                    type="time"
                    className="border rounded px-2 py-1 text-sm w-28 text-gray-700"
                    value={startTime}
                    onChange={(e)=>wrap(setStartTime)(e.target.value)}
                  />
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-gray-500 block">End (optional)</label>
              <div className="flex gap-2">
                <input
                  type="date"
                  className="border rounded px-2 py-1 text-sm w-full text-gray-700"
                  value={endDate}
                  onChange={(e)=>wrap(setEndDate)(e.target.value)}
                />
                {!allDay && (
                  <input
                    type="time"
                    className="border rounded px-2 py-1 text-sm w-28 text-gray-700"
                    value={endTime}
                    onChange={(e)=>wrap(setEndTime)(e.target.value)}
                  />
                )}
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-gray-500 block">Color</label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={()=>wrap(setColor)(c)}
                  className={`w-6 h-6 rounded-full ring-2 ${color===c ? 'ring-black' : 'ring-transparent'}`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
              <input
                type="color"
                value={color}
                onChange={(e)=>wrap(setColor)(e.target.value)}
                className="ml-2 h-6 w-10 p-0 border rounded cursor-pointer"
                title="Custom color"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Status</label>
              <select
                className="border rounded px-2 py-1 text-sm w-full text-gray-700"
                value={status}
                onChange={(e)=>wrap(setStatus)(e.target.value)}
              >
                <option value="">None</option>
                <option value="planned">Planned</option>
                <option value="in_progress">In progress</option>
                <option value="done">Done</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-500 block mb-1">Visibility</label>
              <select
                className="border rounded px-2 py-1 text-sm w-full text-gray-700"
                value={visibility}
                onChange={(e)=>wrap(setVis)(e.target.value)}
              >
                <option value="public">Public (show title)</option>
                <option value="masked">Masked {isVaulted ? '(recommended)' : ''}</option>
              </select>
              {isVaulted && (
                <p className="text-[11px] text-gray-500 mt-1">
                  Masked shows “🔐 Vaulted doc” to non-authorized members.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}