import { X } from "lucide-react";
import FullscreenToggle from "./FullscreenToggle";

export default function CardHeaderActions({ onClose, className = "" }) {
  return (
    <div className={`absolute top-4 right-4 flex items-center gap-2 z-10 ${className}`}>
      <FullscreenToggle />
      <button
        type="button"
        onClick={onClose}
        className="text-gray-400 hover:text-gray-600"
        aria-label="Close"
        title="Close"
      >
        <X size={20} />
      </button>
    </div>
  );
}