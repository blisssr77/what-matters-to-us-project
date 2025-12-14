import React, { useMemo, useState } from "react";
import { X, MoreVertical, Search, UserPlus, Briefcase } from "lucide-react";
import AddFriendModal from "../Modals/AddFriendModal";
import InviteToWorkspaceModal from "../Modals/InviteToWorkspaceModal";
import { useWorkspaceStore } from "../../../store/useWorkspaceStore";
import { useFriendStore } from "@/store/useFriendStore";

function getInitials(label = "") {
  const parts = label.trim().split(/\s+/);
  if (!parts.length) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function ChatHeader({ chat, isWorkspaceChat }) {
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [showInviteWs, setShowInviteWs] = useState(false);
  const { activeWorkspaceId } = useWorkspaceStore();

  // Central place to resolve “other person” label
  const otherUserLabel =
    chat?.otherUserDisplayName ||
    chat?.other_user_display_name ||
    chat?.other_user_username ||
    chat?.other_username ||
    chat?.display_name ||
    null;

  // TITLE: username / name for DM, workspace name for workspace, title for group
  const title = useMemo(() => {
    if (isWorkspaceChat) {
      return chat?.workspace_name || chat?.title || "Workspace";
    }

    if (chat?.chat_type === "direct") {
      return otherUserLabel || "Direct message";
    }

    if (chat?.chat_type === "group") {
      return chat?.title || "Group conversation";
    }

    return chat?.title || "Messenger";
  }, [chat, isWorkspaceChat, otherUserLabel]);

  // SUBTITLE – keep your existing behavior
  const subtitle = useMemo(() => {
    if (isWorkspaceChat && chat?.workspace_name) {
      return `Workspace · ${chat.workspace_name}`;
    }
    if (chat?.otherUserDisplayName) {
      return `Direct · ${chat.otherUserDisplayName}`;
    }
    if (chat?.chat_type === "group") return "Group conversation";
    if (chat?.chat_type === "direct") return "Direct message";
    return "Messenger";
  }, [chat, isWorkspaceChat]);

  const initials = useMemo(() => getInitials(title), [title]);

  const { isFriend } = useFriendStore();
  const otherProfileId = chat?.other_user_id || chat?.otherUserId || null;
  const showAddFriendButton =
    otherProfileId && !isFriend(otherProfileId);

  const canInviteToWorkspace = !!(activeWorkspaceId && otherProfileId);

  return (
    <>
      <header className="flex items-center justify-between gap-3 border-b border-slate-800/40 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-4 py-3 text-slate-50">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-700 text-xs font-semibold">
            {initials}
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight">
              {title}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-300/80">
              {subtitle}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Add friend */}
          {showAddFriendButton && (
            <button
              type="button"
              onClick={() => setShowAddFriend(true)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-600/70 bg-slate-800/80 text-slate-100 text-xs hover:bg-slate-700 hover:border-slate-500 transition"
              title="Add to friends"
            >
              <UserPlus size={14} />
            </button>
          )}

          {/* Invite to workspace */}
          {canInviteToWorkspace && (
            <button
              type="button"
              onClick={() => setShowInviteWs(true)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-200 text-xs hover:bg-emerald-500/20 hover:border-emerald-400 transition"
              title="Invite to active workspace"
            >
              <Briefcase size={14} />
            </button>
          )}

          {/* <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-600/70 bg-slate-800/80 text-slate-100 text-xs hover:bg-slate-700 hover:border-slate-500 transition"
          >
            <Search size={14} />
          </button>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-600/70 bg-slate-800/80 text-slate-100 text-xs hover:bg-slate-700 hover:border-slate-500 transition"
          >
            <MoreVertical size={14} />
          </button>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-600/70 bg-slate-800/80 text-slate-100 text-xs hover:bg-red-500/80 hover:border-red-400 transition"
          >
            <X size={14} />
          </button> */}
        </div>
      </header>

      {/* Modals */}
      {showAddFriend && otherProfileId && (
        <AddFriendModal
          onClose={() => setShowAddFriend(false)}
          preselectedUserId={otherProfileId}
        />
      )}

      {showInviteWs && canInviteToWorkspace && (
        <InviteToWorkspaceModal
          onClose={() => setShowInviteWs(false)}
          workspaceId={activeWorkspaceId}
          fromMessenger
          chatId={chat.id}
          targetProfileId={otherProfileId}
        />
      )}
    </>
  );
}
