import { useState, useMemo, useEffect, useRef } from 'react'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import tzPlugin from 'dayjs/plugin/timezone'
import customParseFormat from 'dayjs/plugin/customParseFormat'

dayjs.extend(utc)
dayjs.extend(tzPlugin)
dayjs.extend(customParseFormat)  

const COLORS = ['#2563eb','#0ea5e9','#10b981','#f59e0b','#ef4444','#7c3aed','#6b7280']

// Convert date + time to ISO in the user's TZ (plain JS, no TS types)
export function toISO({ date, time = '00:00', allDay, tz }) {
  if (!date) return null
  const src = time ? `${date} ${time}` : `${date}`
  const base = time
    ? dayjs.tz(src, 'YYYY-MM-DD HH:mm', tz)
    : dayjs.tz(src, 'YYYY-MM-DD', tz)
  if (!base.isValid()) return null
  return (allDay ? base.startOf('day') : base).toISOString()
}

export default function AddToCalendar({
  initial = {},
  defaultColor = '#2563eb',
  isVaulted = false,
  onChange,
}) {
  const tz = dayjs.tz.guess()

  // state
  const [enabled, setEnabled]     = useState(false)
  const [allDay, setAllDay]       = useState(false)
  const [color, setColor]         = useState(isVaulted ? '#7c3aed' : defaultColor)
  const [status, setStatus]       = useState('')
  const [visibility, setVis]      = useState(isVaulted ? 'masked' : 'public')
  const [startDate, setStartDate] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [endDate, setEndDate]     = useState('')
  const [endTime, setEndTime]     = useState('10:00')
  // to avoid triggering onChange on every single keystroke
  const userDirty = useRef(false)
  const wrap = (setter) => (v) => { userDirty.current = true; setter(v) }

  // memoized initial key to avoid running init useEffect on every render
  const initialKey = useMemo(() => JSON.stringify(initial ?? {}), [initial])

  // init from initial prop (only if user hasn't changed anything yet)
  useEffect(() => {
    if (userDirty.current) return

    const initEnabled =
      'calendar_enabled' in initial ? !!initial.calendar_enabled : !!initial.enabled

    const initAllDay = !!(initial.all_day ?? initial.allDay)
    const initColor  = initial.calendar_color ?? initial.color ?? (isVaulted ? '#7c3aed' : defaultColor)
    const initStatus = initial.calendar_status ?? initial.status ?? ''
    const initVis    = initial.calendar_visibility ?? initial.visibility ?? (isVaulted ? 'masked' : 'public')

    const s = initial.start_at ? dayjs(initial.start_at).tz(tz) : null
    const e = initial.end_at   ? dayjs(initial.end_at).tz(tz)   : null

    setEnabled(initEnabled)
    setAllDay(initAllDay)
    setColor(initColor)
    setStatus(initStatus)
    setVis(initVis)

    setStartDate(s && s.isValid() ? s.format('YYYY-MM-DD') : '')
    setStartTime(s && s.isValid() && !initAllDay ? s.format('HH:mm') : '09:00')

    setEndDate(e && e.isValid() ? e.format('YYYY-MM-DD') : '')
    setEndTime(e && e.isValid() && !initAllDay ? e.format('HH:mm') : '10:00')
  }, [initialKey, isVaulted, defaultColor, tz])

  // Build normalized payload
  const payload = useMemo(() => {
    if (!enabled) return null

    // Start
    const startISO = toISO({
      date: startDate || null,
      time: allDay ? '00:00' : (startTime || '00:00'),
      allDay,
      tz
    })
    // Require a valid start to be considered “ready”
    if (!startISO) return null

    // End rules:
    // - allDay & no endDate => same day 23:59
    // - timed & no end => +1 hour from start (if start valid)
    let endISO = null

    if (endDate) {
      endISO = toISO({
        date: endDate,
        time: allDay ? '23:59' : (endTime || '00:00'),
        allDay,
        tz
      })
    } else if (startISO) {
      const s = dayjs(startISO)
      if (allDay) {
        endISO = s.endOf('day').toISOString()
      } else {
        endISO = s.add(1, 'hour').toISOString()
      }
    }

    return {
      calendar_enabled: true,
      start_at: startISO,
      end_at: endISO,
      all_day: !!allDay,
      calendar_color: color || null,
      calendar_status: status || null,
      calendar_visibility: visibility || (isVaulted ? 'masked' : 'public'),
    }
  }, [enabled, allDay, startDate, startTime, endDate, endTime, color, status, visibility, isVaulted, tz])

  // onChange callback
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

      {/* details */}
      {enabled && (
        <>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={allDay} onChange={(e)=>wrap(setAllDay)(e.target.checked)} />
            All day
          </label>

          {/* date + time pickers */}
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

            {/* end */}
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

          {/* color, status, visibility */}
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

          {/* status + visibility */}
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

            {/* visibility */}
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