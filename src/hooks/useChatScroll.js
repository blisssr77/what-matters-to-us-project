import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Hook to manage scroll behavior in chat window.
 * - auto-scrolls to bottom when messages change if user was already near bottom
 * - tracks whether user is at bottom or not
 *
 * Usage:
 *   const { containerRef, isAtBottom, scrollToBottom } = useChatScroll(messages);
 *   <div ref={containerRef}>...messages...</div>
 */
export function useChatScroll(messages, options = {}) {
  const { bottomThreshold = 80 } = options;
  const containerRef = useRef(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const scrollToBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  // Track scroll position
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      setIsAtBottom(distanceFromBottom <= bottomThreshold);
    };

    el.addEventListener("scroll", handleScroll);
    // initial
    handleScroll();

    return () => {
      el.removeEventListener("scroll", handleScroll);
    };
  }, [bottomThreshold]);

  const lastMessageKey = Array.isArray(messages) && messages.length
    ? messages[messages.length - 1].id ?? messages.length
    : 0;

  // Auto-scroll when messages change if user is already at bottom
  useEffect(() => {
    if (!containerRef.current) return;
    if (!isAtBottom) return;
    scrollToBottom();
  }, [lastMessageKey, isAtBottom, scrollToBottom]);

  return {
    containerRef,
    isAtBottom,
    scrollToBottom,
  };
}
