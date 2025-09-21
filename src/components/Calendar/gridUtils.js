import dayjs from 'dayjs';

export const HOUR_PX = 64;
export const MIN_HEIGHT = 28;
export const OVERLAP_GAP_PX = 2;

export const minsSinceMidnight = (d) => d.hour() * 60 + d.minute();

export const segKey = (e, dayIdx, s) =>
  `${e.scope || 'x'}:${e.id}:${dayIdx}:${s.segStart.valueOf()}:${s.segEnd.valueOf()}`;

export function hexToRgba(hex, alpha = 0.85) {
  if (!hex) return `rgba(37,99,235,${alpha})`;
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(ch => ch + ch).join('');
  const int = parseInt(h, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Lane layout: place overlapping items side-by-side
export function layoutDaySegments(items) {
  const byStart = [...items].sort((a, b) =>
    a.segStart.valueOf() - b.segStart.valueOf() ||
    a.segEnd.valueOf() - b.segEnd.valueOf()
  );

  let active = [];
  let clusterId = 0;
  const clusterMax = new Map();

  for (const it of byStart) {
    const startMs = it.segStart.valueOf();
    active = active.filter(a => a.end > startMs);  // end <= start: no overlap
    if (active.length === 0) clusterId += 1;

    const used = new Set(active.map(a => a.lane));
    let lane = 0; while (used.has(lane)) lane++;

    active.push({ end: it.segEnd.valueOf(), lane, item: it });
    it.lane = lane;
    it.cluster = clusterId;

    const prevMax = clusterMax.get(clusterId) ?? 0;
    clusterMax.set(clusterId, Math.max(prevMax, lane + 1));
  }

  const maxByCluster = Object.fromEntries(clusterMax);
  for (const it of byStart) {
    const lanes = Math.max(1, maxByCluster[it.cluster] || 1);
    it.widthPct = 100 / lanes;
    it.leftPct = it.lane * it.widthPct;
  }
  return byStart;
}

// --- Segment builders (reused across views) ---
function clipToDay(start, end, day) {
  const dayStart = day.startOf('day');
  const dayEnd   = day.endOf('day');
  const s = start.isAfter(dayStart) ? start : dayStart;
  const e = end && end.isBefore(dayEnd) ? end : dayEnd;
  return { s, e };
}

function splitIntoDaySegments(e, weekStart) {
  const start = dayjs(e.start_at);
  const end   = e.end_at ? dayjs(e.end_at) : start.add(30, 'minute');
  const segments = [];
  for (let i = 0; i < 7; i++) {
    const d = weekStart.add(i, 'day');
    if (start.isBefore(d.endOf('day')) && end.isAfter(d.startOf('day'))) {
      const { s, e: ee } = clipToDay(start, end, d);
      segments.push({ dayIndex: i, segStart: s, segEnd: ee });
    }
  }
  return segments;
}

function buildDailyWindowSegments(e, weekStart) {
  const firstDay = dayjs(e.start_at).startOf('day');
  const untilDay = dayjs(e.calendar_repeat_until || e.end_at || e.start_at).startOf('day');
  const startHM = e.calendar_window_start;
  const endHM   = e.calendar_window_end;

  const segments = [];
  for (let i = 0; i < 7; i++) {
    const d = weekStart.add(i, 'day');
    if (d.isBefore(firstDay, 'day') || d.isAfter(untilDay, 'day')) continue;
    const segStart = dayjs(`${d.format('YYYY-MM-DD')} ${startHM}`);
    const segEnd   = dayjs(`${d.format('YYYY-MM-DD')} ${endHM}`);
    segments.push({ dayIndex: i, segStart, segEnd });
  }
  return segments;
}

function buildDailyWindowFromRange(e, weekStart) {
  const start = dayjs(e.start_at);
  const end   = dayjs(e.end_at);
  const startHM = start.format('HH:mm');
  const endHM   = end.format('HH:mm');

  const firstDay = start.startOf('day');
  const lastDay  = end.startOf('day');

  const segments = [];
  for (let i = 0; i < 7; i++) {
    const d = weekStart.add(i, 'day');
    if (d.isBefore(firstDay, 'day') || d.isAfter(lastDay, 'day')) continue;
    const segStart = dayjs(`${d.format('YYYY-MM-DD')} ${startHM}`);
    const segEnd   = dayjs(`${d.format('YYYY-MM-DD')} ${endHM}`);
    segments.push({ dayIndex: i, segStart, segEnd });
  }
  return segments;
}

export function buildSegmentsForEvent(e, weekStart) {
  const hasExplicitDaily =
    e.calendar_repeat === 'daily' &&
    e.calendar_window_start &&
    e.calendar_window_end;

  if (hasExplicitDaily) return buildDailyWindowSegments(e, weekStart);

  const hasMultiDayRange =
    !e.all_day && e.end_at &&
    dayjs(e.end_at).startOf('day').diff(dayjs(e.start_at).startOf('day'), 'day') >= 1;

  if (hasMultiDayRange) return buildDailyWindowFromRange(e, weekStart);

  return splitIntoDaySegments(e, weekStart);
}

// --- simple day intersection (for month view) ---
export function intersectsDay(e, day, tz) {
//   const start = tz ? dayjs.tz(e.start_at, tz) : dayjs(e.start_at);
//   const end   = e.end_at ? (tz ? dayjs.tz(e.end_at, tz) : dayjs(e.end_at)) : start;
    const start = tz ? dayjs(e.start_at).tz(tz) : dayjs(e.start_at);
    const end   = e.end_at ? (tz ? dayjs(e.end_at).tz(tz) : dayjs(e.end_at)) : start;

  const iso = day.format('YYYY-MM-DD');   // anchor date
//   const dayStart = tz ? dayjs.tz(`${iso} 00:00`, tz) : day.startOf('day');
//   const dayEnd   = tz ? dayjs.tz(`${iso} 23:59:59.999`, tz) : day.endOf('day');
    const dayStart = tz ? dayjs(`${iso}T00:00:00`).tz(tz) : day.startOf('day');
    const dayEnd   = tz ? dayjs(`${iso}T23:59:59.999`).tz(tz) : day.endOf('day');

  return !(end.isBefore(dayStart) || start.isAfter(dayEnd));
}