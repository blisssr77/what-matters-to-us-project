import { supabase } from "../supabaseClient";
import { sanitizeMessage } from "../../utils/sanitizeMessage";
import { normalizeMessageRow } from "../../utils/messageNormalizer";

/**
 * Send a message into a chat.
 *
 * @param {Object} opts
 * @param {string} opts.chatId
 * @param {string} opts.senderId
 * @param {string|null} [opts.text]
 * @param {"text"|"image"|"video"|"file"|"invite"|"system"} [opts.type="text"]
 * @param {string|null} [opts.attachmentUrl]
 * @param {string|null} [opts.attachmentThumbnail]
 * @param {string|null} [opts.inviteWorkspaceId]
 */
export async function sendMessage(opts) {
  const {
    chatId,
    senderId,
    text,
    type = "text",
    attachmentUrl = null,
    attachmentThumbnail = null,
    inviteWorkspaceId = null,
  } = opts || {};

  if (!chatId) throw new Error("sendMessage: chatId is required");
  if (!senderId) throw new Error("sendMessage: senderId is required");

  const cleanedText =
    type === "text" || type === "invite" || type === "system"
      ? sanitizeMessage(text || "")
      : null;

  const { data, error } = await supabase
    .from("messenger_messages")
    .insert({
      chat_id: chatId,
      sender_id: senderId,
      message_text: cleanedText,
      message_type: type,
      attachment_url: attachmentUrl,
      attachment_thumbnail: attachmentThumbnail,
      invite_workspace_id: inviteWorkspaceId,
    })
    .select("*")
    .single();

  if (error) {
    console.error("sendMessage error:", error);
    throw error;
  }

  return normalizeMessageRow(data);
}
