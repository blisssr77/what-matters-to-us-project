import { supabase } from "../supabaseClient";
import {
  inferAttachmentType,
  isAttachmentSizeAllowed,
  buildAttachmentPath,
} from "../../utils/attachmentHelper";

const BUCKET = import.meta.env.VITE_SUPABASE_MESSENGER_BUCKET || "messenger-files";

/**
 * Upload a file to Supabase Storage for messenger.
 *
 * @param {Object} opts
 * @param {File|Blob} opts.file
 * @param {string} opts.userId
 * @param {string} [opts.folder="attachments"]
 */
export async function uploadAttachment(opts) {
  const { file, userId, folder = "attachments" } = opts || {};

  if (!file) throw new Error("uploadAttachment: file is required");
  if (!userId) throw new Error("uploadAttachment: userId is required");

  if (!isAttachmentSizeAllowed(file)) {
    throw new Error("Attachment too large");
  }

  const contentType = file.type || "application/octet-stream";
  const path = buildAttachmentPath({ userId, folder, file });

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType,
    });

  if (error) {
    console.error("uploadAttachment error:", error);
    throw error;
  }

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const url = pub?.publicUrl || null;
  const messageType = inferAttachmentType({ file, contentType, typeHint: "auto" });

  return {
    path: data?.path || path,
    url,
    contentType,
    messageType,
  };
}
