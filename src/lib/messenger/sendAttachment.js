import { uploadAttachment } from "./uploadAttachment";
import { sendMessage } from "./sendMessage";

/**
 * 1) Uploads a file
 * 2) Sends a message with attachment_url
 * 3) Optionally sends a text message after
 */
export async function sendAttachment(opts) {
  const {
    chatId,
    senderId,
    file,
    typeHint = "auto",
    folder = "attachments",
    textAfter = null,
  } = opts || {};

  if (!chatId) throw new Error("sendAttachment: chatId is required");
  if (!senderId) throw new Error("sendAttachment: senderId is required");
  if (!file) throw new Error("sendAttachment: file is required");

  // 1) upload
  const uploaded = await uploadAttachment({
    file,
    userId: senderId,
    folder,
  });

  // 2) send attachment message
  const msgType = typeHint === "auto" ? uploaded.messageType : typeHint;

  const attachmentMessage = await sendMessage({
    chatId,
    senderId,
    text: null,
    type: msgType,
    attachmentUrl: uploaded.url,
    attachmentThumbnail: null, // can add thumb later
    inviteWorkspaceId: null,
  });

  // 3) optional text
  let textMessage = null;
  if (textAfter && textAfter.trim()) {
    textMessage = await sendMessage({
      chatId,
      senderId,
      text: textAfter,
      type: "text",
    });
  }

  return {
    attachmentMessage,
    textMessage,
    uploaded,
  };
}
