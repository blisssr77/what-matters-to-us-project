import { Maximize2, Minimize2 } from "lucide-react";
import { useFullscreen } from "./FullscreenProvider";

export default function FullscreenToggle({ className = "" }) {
  const { isFullscreen, toggle } = useFullscreen();
  return (
    <button
      type="button"
      onClick={toggle}
      className={`text-gray-400 hover:text-gray-600 ${className}`}
      aria-label={isFullscreen ? "Exit full screen" : "Enter full screen"}
      title={isFullscreen ? "Exit full screen" : "Full screen"}
    >
      {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
    </button>
  );
}