import FullCalendar from '@fullcalendar/react';
import dayGrid from '@fullcalendar/daygrid';
import timeGrid from '@fullcalendar/timegrid';
import interaction from '@fullcalendar/interaction';
import { useEffect, useState, useCallback } from 'react';
import { listWorkspaceEvents, updateEventTime } from '@/lib/calendarApi';
import { useCalendarStore } from '@/store/useCalendarStore';

export default function CalendarBoard({ scope='workspace', workspaceId }) {
  const { range, setRange, filters, events, setEvents } = useCalendarStore();
  const [loading, setLoading] = useState(false);

  const fetchEvents = useCallback(async (from, to) => {
    if (!workspaceId) return;
    setLoading(true);
    const { data, error } = await listWorkspaceEvents(workspaceId, from, to);
    setLoading(false);
    if (!error) {
      const fc = (data || []).map(row => ({
        id: row.id,
        title: row.title || '(untitled)',
        start: row.start_at,
        end: row.end_at,
        allDay: row.all_day,
        backgroundColor: row.calendar_color || undefined,
        extendedProps: { ...row }
      }));
      setEvents(fc);
    }
  }, [workspaceId, setEvents]);

  return (
    <FullCalendar
      plugins={[dayGrid, timeGrid, interaction]}
      initialView="timeGridWeek"
      headerToolbar={false}
      height="100%"
      editable
      selectable
      datesSet={(arg) => {
        setRange({ from: arg.startStr, to: arg.endStr });
        fetchEvents(arg.startStr, arg.endStr);
      }}
      eventDrop={async (info) => {
        await updateEventTime({
          id: info.event.id,
          start: info.event.startStr,
          end: info.event.endStr,
          allDay: info.event.allDay
        });
      }}
      eventResize={async (info) => {
        await updateEventTime({
          id: info.event.id,
          start: info.event.startStr,
          end: info.event.endStr,
          allDay: info.event.allDay
        });
      }}
      events={events /* apply filter in a selector if you want */}
    />
  );
}
