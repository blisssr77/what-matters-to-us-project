import React from "react";
import { useParams } from "react-router-dom";

import Layout from "@/components/Layout/Layout";

import FriendSidebar from "../../../components/Messenger/FriendSidebar/FriendSidebar";
import MessageList from "../../../components/Messenger/MessageList/MessageList";
import ChatWindow from "../../../components/Messenger/ChatWindow/Chatwindow";

import { useMessengerStore } from "../../../store/useMessengerStore";
import { useMessenger } from "../../../hooks/useMessenger";
import { useRealtimeInbox } from "@/hooks/useRealtimeInbox";
import { supabase } from "../../../lib/supabaseClient";

function WorkspaceSidebar({ workspaceId }) {
  return (
    <div className="flex h-full flex-col bg-slate-950 text-slate-50 border-r border-slate-800">
      <div className="px-3 py-2 border-b border-slate-800 bg-slate-950/90">
        <h2 className="text-xs font-semibold tracking-wide text-slate-200">
          Workspace Messenger
        </h2>
        <p className="text-[11px] text-slate-500">
          Workspace ID:{" "}
          <span className="font-mono text-[10px] text-slate-300">
            {workspaceId || "–"}
          </span>
        </p>
      </div>

      <div className="flex-1 px-3 py-3 text-[11px] text-slate-500">
        Later you can list:
        <ul className="mt-1 list-disc list-inside space-y-1">
          <li>Workspace channels</li>
          <li>Project or doc-specific threads</li>
          <li>Members online</li>
        </ul>
      </div>
    </div>
  );
}

export default function MessengerPage() {
  const { workspaceId } = useParams();
  const mode = workspaceId ? "workspace" : "direct";

  // Realtime inbox updates
  useRealtimeInbox();

  const {
    selectedChatId,
    setSelectedChatId,
    upsertChatPreview,
  } = useMessengerStore();

  // Chat helper (loads messages + sets selectedChatId internally)
  const { openChat } = useMessenger();

  // When user clicks a conversation in MessageList
  const handleSelectChat = async (chatId) => {
    if (!chatId) return;
    await openChat(chatId);
  };

  // Open or create a direct chat with the given user
  const handleOpenChatWithUserId = async (otherUserId) => {
    if (!otherUserId) return;

    try {
      const {
        data: { user },
        error: authErr,
      } = await supabase.auth.getUser();

      if (authErr || !user?.id) {
        console.error("No authenticated user for Messenger:", authErr);
        return;
      }

      const currentUserId = user.id;

      // Find existing direct chat (either direction)
      const { data: existing, error: existingErr } = await supabase
        .from("messenger_chats")
        .select("*")
        .eq("chat_type", "direct")
        .or(
          `and(user_a.eq.${currentUserId},user_b.eq.${otherUserId}),and(user_a.eq.${otherUserId},user_b.eq.${currentUserId})`
        )
        .maybeSingle();

      if (existingErr && existingErr.code !== "PGRST116") {
        console.error("Error looking up existing direct chat:", existingErr);
      }

      let chat = existing || null;

      // Create if not found
      if (!chat) {
        const { data: created, error: createErr } = await supabase
          .from("messenger_chats")
          .insert({
            chat_type: "direct",
            user_a: currentUserId,
            user_b: otherUserId,
          })
          .select("*")
          .single();

        if (createErr) {
          console.error("Failed to create direct chat:", createErr);
          return;
        }

        chat = created;
      }

      if (chat) {
        // keep messenger list in sync
        upsertChatPreview({
          chat_id: chat.id,
          chat_type: chat.chat_type,
          title: chat.title,
          updated_at: chat.updated_at,
        });

        // open chat (sets selectedChatId + loads messages)
        await openChat(chat.id);
        setSelectedChatId(chat.id);
      }
    } catch (err) {
      console.error("Failed to open direct chat:", err);
    }
  };

  const hasActiveChat = !!selectedChatId;

  return (
    <Layout>
      <div className="mt-1 h-[calc(100vh-7rem)] rounded-2xl border border-slate-800 bg-slate-950/95 overflow-hidden flex text-slate-50 shadow-[0_18px_45px_rgba(15,23,42,0.75)]">
        {/* LEFT SIDEBAR */}
        <div className="hidden md:flex md:w-64 lg:w-72">
          {mode === "direct" ? (
            <FriendSidebar onOpenChatWithUserId={handleOpenChatWithUserId} />
          ) : (
            <WorkspaceSidebar workspaceId={workspaceId} />
          )}
        </div>

        {/* MIDDLE COLUMN: MESSAGE LIST */}
        <div className="hidden sm:flex sm:w-64 lg:w-80 border-l border-r border-slate-800 bg-slate-950/90">
          <MessageList
            mode={mode}
            workspaceId={workspaceId}
            activeChatId={selectedChatId}
            onSelectChat={handleSelectChat}
          />
        </div>

        {/* RIGHT COLUMN: CHAT WINDOW */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col bg-slate-950">
          {hasActiveChat ? (
            <ChatWindow />
          ) : (
            <div className="flex flex-1 items-center justify-center text-xs text-slate-500">
              <div className="text-center px-6">
                <div className="mb-3 text-2xl">💬</div>
                <h2 className="text-sm font-semibold text-slate-200 mb-1">
                  Welcome to Messenger
                </h2>
                <p className="text-[11px] text-slate-400">
                  Select a conversation on the left to start messaging, or add a
                  friend to create a new chat.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
