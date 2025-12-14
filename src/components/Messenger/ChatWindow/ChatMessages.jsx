import React, {
  forwardRef,
  useMemo,
  useRef,
  useEffect,
  useCallback,
} from "react";
import { useNavigate } from "react-router-dom";
import { formatMessageClock } from "../../../utils/formatMessageTime";
import { sanitizeMessage } from "../../../utils/sanitizeMessage";

const ChatMessages = forwardRef(
  (
    {
      messages,
      hasMore,
      onLoadMore,
      currentUserId,
      isAtBottom,
      onScrollToBottom,
    },
    ref
  ) => {
    const navigate = useNavigate();

    // Store keeps newest → oldest, but UI should show oldest at top
    const ordered = useMemo(
      () => (Array.isArray(messages) ? [...messages].reverse() : []),
      [messages]
    );

    const hasAnyMessages = ordered.length > 0;

    // --- Auto-scroll to latest when YOU send a new message ---
    const prevLengthRef = useRef(messages?.length || 0);

    useEffect(() => {
      const currLen = messages?.length || 0;

      // New messages were added
      if (currLen > prevLengthRef.current) {
        const newest = Array.isArray(messages) ? messages[0] : null;

        // If the newest message is from the current user -> auto scroll to bottom
        if (newest && newest.sender_id === currentUserId && onScrollToBottom) {
          onScrollToBottom();
        }
      }

      prevLengthRef.current = currLen;
    }, [messages, currentUserId, onScrollToBottom]);

    // ---- Auto-initial load when there is history (no button needed) ----
    const initialLoadRef = useRef(false);

    useEffect(() => {
      if (
        !initialLoadRef.current &&
        hasMore &&
        !hasAnyMessages &&
        typeof onLoadMore === "function"
      ) {
        initialLoadRef.current = true;
        onLoadMore();
      }
    }, [hasMore, hasAnyMessages, onLoadMore]);

    // ---- Infinite scroll: load older when user scrolls to top ----
    const fetchingOlderRef = useRef(false);

    useEffect(() => {
      const el = ref && "current" in ref ? ref.current : null;
      if (!el || !hasMore || !onLoadMore) return;

      const handleScroll = () => {
        if (!hasMore || fetchingOlderRef.current) return;
        // Close to the top
        if (el.scrollTop <= 10) {
          fetchingOlderRef.current = true;
          onLoadMore();
        }
      };

      el.addEventListener("scroll", handleScroll);

      return () => {
        el.removeEventListener("scroll", handleScroll);
      };
    }, [ref, hasMore, onLoadMore]);

    // Reset the "fetching older" flag whenever messages change or hasMore flips
    useEffect(() => {
      fetchingOlderRef.current = false;
    }, [messages, hasMore]);

    // ---- Scroll helpers for buttons ----
    const handleScrollToTop = useCallback(() => {
      const el = ref && "current" in ref ? ref.current : null;
      if (!el) return;
      el.scrollTop = 0;
    }, [ref]);

    return (
      <div className="flex-1 overflow-hidden bg-slate-100">
        <div
          ref={ref}
          className="flex h-full flex-col gap-2 overflow-y-auto px-3 py-3 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent"
        >
          {/* Only show empty-state text if truly no history and no more pages */}
          {!hasAnyMessages && !hasMore && (
            <div className="mt-8 text-center text-xs text-slate-500">
              No messages yet. Say hi 👋
            </div>
          )}

          {/* Messages */}
          {hasAnyMessages &&
            ordered.map((msg) => {
              const isMine = msg.sender_id === currentUserId;
              const timeLabel = msg.created_at
                ? formatMessageClock(msg.created_at)
                : "";

              const baseBubble = `
                inline-block max-w-[75%] rounded-2xl px-3 py-1.5 text-xs md:text-sm
              `;

              const bubbleClasses = isMine
                ? `${baseBubble} bg-indigo-600 text-white rounded-br-none`
                : `${baseBubble} bg-white text-slate-900 rounded-bl-none`;

              const wrapperClasses = isMine
                ? "flex justify-end mb-1"
                : "flex justify-start mb-1";

              const text =
                typeof msg.message_text === "string"
                  ? sanitizeMessage(msg.message_text)
                  : "";

              let content = null;

              if (msg.message_type === "image" && msg.attachment_url) {
                content = (
                  <div className={`${bubbleClasses} p-1`}>
                    <img
                      src={msg.attachment_url}
                      alt="Attachment"
                      className="max-h-64 rounded-xl"
                    />
                  </div>
                );
              } else if (msg.message_type === "video" && msg.attachment_url) {
                content = (
                  <div className={`${bubbleClasses} p-1`}>
                    <video
                      src={msg.attachment_url}
                      className="max-h-64 rounded-xl"
                      controls
                    />
                  </div>
                );
              } else if (msg.message_type === "file" && msg.attachment_url) {
                content = (
                  <a
                    href={msg.attachment_url}
                    target="_blank"
                    rel="noreferrer"
                    className={`${bubbleClasses} underline`}
                  >
                    📎 {msg.attachment_url.split("/").slice(-1)[0] || "File"}
                  </a>
                );
              } else if (msg.message_type === "invite") {
                content = (
                  <div
                    className={`${bubbleClasses} bg-amber-50 text-amber-900 border border-amber-200`}
                  >
                    <div className="text-[11px] font-semibold">
                      Workspace invite
                    </div>
                    <div className="mt-0.5 text-[11px] opacity-80">
                      You’ve been invited to collaborate in a workspace.
                    </div>

                    <button
                      type="button"
                      onClick={() => navigate("/workspace/vaults")}
                      className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-amber-500 transition"
                    >
                      Open workspace
                      <span aria-hidden>↗</span>
                    </button>
                  </div>
                );
              } else if (msg.message_type === "system") {
                return (
                  <div
                    key={msg.id}
                    className="my-2 text-center text-[11px] text-slate-400"
                  >
                    {text}
                  </div>
                );
              } else {
                // regular text
                content = <div className={bubbleClasses}>{text}</div>;
              }

              return (
                <div key={msg.id} className={wrapperClasses}>
                  <div className="max-w-full">
                    {content}
                    {timeLabel && (
                      <div className="mt-0.5 text-[10px] text-slate-400 text-right">
                        {timeLabel}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

          {/* Scroll controls when there are messages */}
          {hasAnyMessages && (
            <div className="sticky bottom-2 flex justify-between pointer-events-none">
              {/* Jump to top */}
              <div className="pointer-events-auto">
                <button
                  type="button"
                  onClick={handleScrollToTop}
                  className="rounded-full bg-slate-900/80 px-3 py-1 text-[11px] text-slate-50 shadow-md hover:bg-slate-900"
                >
                  Top ↑
                </button>
              </div>

              {/* “New messages” pill when user is scrolled up */}
              {!isAtBottom && (
                <div className="pointer-events-auto">
                  <button
                    type="button"
                    onClick={onScrollToBottom}
                    className="rounded-full bg-slate-900/90 px-3 py-1 text-[11px] text-slate-50 shadow-md hover:bg-slate-900"
                  >
                    New messages ↓
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }
);

export default ChatMessages;
