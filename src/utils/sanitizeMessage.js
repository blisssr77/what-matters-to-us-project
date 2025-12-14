/**
 * Sanitize a message string before sending to backend.
 * - trims whitespace
 * - strips most control characters
 * - hard-limits length
 *
 * This keeps messages safe & lightweight, but final XSS safety
 * is handled by React when rendering.
 *
 * @param {string} input
 * @param {number} maxLength
 * @returns {string} sanitized
 */
export function sanitizeMessage(input, maxLength = 4000) {
  if (!input || typeof input !== "string") return "";

  let value = input.trim();

  // Remove control characters except: \n, \r, \t
  value = value.replace(/[^\x20-\x7E\n\r\t]/g, "");

  if (!value) return "";

  if (value.length > maxLength) {
    value = value.slice(0, maxLength);
  }

  return value;
}