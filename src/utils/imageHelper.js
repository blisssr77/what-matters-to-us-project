/**
 * Returns true if a File/Blob looks like an image by MIME type
 * or filename extension.
 */
export function isImageFile(file) {
  if (!file) return false;

  const type = file.type || "";
  if (type.startsWith("image/")) return true;

  const name = (file.name || "").toLowerCase();
  return (
    name.endsWith(".png") ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    name.endsWith(".gif") ||
    name.endsWith(".webp") ||
    name.endsWith(".bmp") ||
    name.endsWith(".svg")
  );
}

/**
 * Returns true if a contentType string is an image.
 */
export function isImageContentType(contentType) {
  if (!contentType) return false;
  return contentType.startsWith("image/");
}

/**
 * Create a temporary object URL (for previews).
 * Caller is responsible for URL.revokeObjectURL when done.
 */
export function createImagePreviewUrl(file) {
  if (!file) return null;
  try {
    return URL.createObjectURL(file);
  } catch {
    return null;
  }
}