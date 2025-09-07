import { supabase } from './supabaseClient';

export async function listWorkspaceEvents(workspaceId, from, to) {
  return supabase.rpc('get_workspace_calendar_items', {
    p_workspace: workspaceId, p_from: from, p_to: to
  });
}

export async function updateEventTime({ id, start, end, allDay }) {
  return supabase.rpc('update_workspace_calendar_time', {
    p_id: id, p_start: start, p_end: end, p_all_day: allDay
  });
}

export async function saveEventMeta({ id, title, status, color, assigneeId }) {
  return supabase.rpc('upsert_workspace_calendar_meta', {
    p_id: id, p_title: title, p_status: status, p_color: color, p_assignee: assigneeId
  });
}
