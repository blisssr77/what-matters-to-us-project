// Matches messenger_messages table 1:1
export function normalizeMessageRow(raw) {
  if (!raw) return null;

  const {
    id,
    chat_id,
    sender_id,
    message_text,
    message_type,
    attachment_url,
    attachment_thumbnail,
    invite_workspace_id,
    created_at,
    read,
    ...rest
  } = raw;

  return {
    id,
    chat_id,
    sender_id,
    message_text: message_text ?? null,
    message_type: message_type || "text",
    attachment_url: attachment_url ?? null,
    attachment_thumbnail: attachment_thumbnail ?? null,
    invite_workspace_id: invite_workspace_id ?? null,
    created_at: created_at || null,
    read: !!read,
    meta: rest || {},
  };
}

export function normalizeMessageList(rawList) {
  if (!Array.isArray(rawList)) return [];
  return rawList.map(normalizeMessageRow).filter(Boolean);
}
