import { createContext, useContext, useState, useCallback, useEffect, useMemo } from "react";

const FullscreenContext = createContext(null);

export function FullscreenProvider({ children }) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  const enter  = useCallback(() => setIsFullscreen(true), []);
  const exit   = useCallback(() => setIsFullscreen(false), []);
  const toggle = useCallback(() => setIsFullscreen(v => !v), []);

  // Lock background scroll while fullscreen
  useEffect(() => {
    const root = document.documentElement; // <html>
    if (isFullscreen) root.classList.add("wm-fullscreen-open");
    else root.classList.remove("wm-fullscreen-open");
    return () => root.classList.remove("wm-fullscreen-open");
  }, [isFullscreen]);

  // ESC to exit
  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e) => { if (e.key === "Escape") exit(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isFullscreen, exit]);

  const value = useMemo(() => ({ isFullscreen, enter, exit, toggle }), [isFullscreen, enter, exit, toggle]);

  return (
    <FullscreenContext.Provider value={value}>
      {children}
    </FullscreenContext.Provider>
  );
}

export function useFullscreen() {
  const ctx = useContext(FullscreenContext);
  if (!ctx) throw new Error("useFullscreen must be used within <FullscreenProvider>");
  return ctx;
}