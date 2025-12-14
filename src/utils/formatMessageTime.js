import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

/**
 * Format a timestamp for chat bubble footer.
 * Example: "3:21 PM"
 */
export function formatMessageClock(ts) {
  if (!ts) return "";
  return dayjs(ts).format("h:mm A");
}

/**
 * Format a timestamp for chat preview / sidebar.
 * - Today: "3:21 PM"
 * - This week: "Mon"
 * - Older: "Feb 14"
 */
export function formatMessagePreviewTime(ts) {
  if (!ts) return "";

  const d = dayjs(ts);
  const now = dayjs();

  if (d.isSame(now, "day")) {
    return d.format("h:mm A");
  }

  if (d.isAfter(now.subtract(6, "day"), "day")) {
    return d.format("ddd"); // "Mon", "Tue"
  }

  return d.format("MMM D"); // "Feb 14"
}

/**
 * Optional: human relative time for tooltips
 * Example: "5 minutes ago"
 */
export function formatMessageRelative(ts) {
  if (!ts) return "";
  return dayjs(ts).fromNow();
}