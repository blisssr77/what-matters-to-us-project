import { isImageFile, isImageContentType } from "./imageHelper";
import { isVideoFile, isVideoContentType } from "./videoHelper";

/**
 * Decide the "message_type" based on file and/or contentType.
 * Returns: "image" | "video" | "file"
 */
export function inferAttachmentType({ file, contentType, typeHint = "auto" }) {
  if (typeHint && typeHint !== "auto") {
    return typeHint; // caller explicitly requested "image" | "video" | "file"
  }

  const ct = contentType || file?.type || "";

  if (file) {
    if (isImageFile(file)) return "image";
    if (isVideoFile(file)) return "video";
  }

  if (ct) {
    if (isImageContentType(ct)) return "image";
    if (isVideoContentType(ct)) return "video";
  }

  return "file";
}

/**
 * Very basic size guard.
 * Returns true if file is allowed.
 * @param {File} file
 * @param {number} maxBytes default ~20MB
 */
export function isAttachmentSizeAllowed(file, maxBytes = 20 * 1024 * 1024) {
  if (!file || typeof file.size !== "number") return false;
  return file.size <= maxBytes;
}

/**
 * Generate a safe-ish filename for storage:
 * - lowercases
 * - strips weird chars
 * - prefixes userId and timestamp for uniqueness
 */
export function buildAttachmentPath({ userId, folder = "attachments", file }) {
  const rawName = (file?.name || "file").toLowerCase();
  const safeName = rawName.replace(/[^a-z0-9.\-_]/g, "_");

  const ts = Date.now();
  const owner = userId || "anon";

  return `${folder}/${owner}/${ts}-${safeName}`;
}
