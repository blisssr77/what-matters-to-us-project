/**
 * Returns true if a File/Blob looks like a video by MIME type
 * or filename extension.
 */
export function isVideoFile(file) {
  if (!file) return false;

  const type = file.type || "";
  if (type.startsWith("video/")) return true;

  const name = (file.name || "").toLowerCase();
  return (
    name.endsWith(".mp4") ||
    name.endsWith(".mov") ||
    name.endsWith(".webm") ||
    name.endsWith(".avi") ||
    name.endsWith(".mkv")
  );
}

/**
 * Returns true if a contentType string is a video.
 */
export function isVideoContentType(contentType) {
  if (!contentType) return false;
  return contentType.startsWith("video/");
}