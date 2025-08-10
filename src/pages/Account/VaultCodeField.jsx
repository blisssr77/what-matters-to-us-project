import { useEffect, useRef, useState } from "react";
import { Check, X, Loader2 } from "lucide-react";

/**
 * VaultCodeField
 * - If `verifyAsync` is provided, it debounces and calls it, showing checking/good/bad.
 * - Or pass `statusProp` = "idle" | "checking" | "good" | "bad" to fully control the icon.
 */
export default function VaultCodeField({
  label,
  value,
  onChange,
  placeholder,
  id,
  name,
  autoComplete = "off",
  disabled = false,
  minLength = 6,
  debounceMs = 700,
  verifyAsync,        // async (val) => boolean
  statusProp,         // "idle" | "checking" | "good" | "bad"
  className = "",
  inputClassName = "w-full border rounded px-3 py-2 text-sm pr-8 text-gray-800",
}) {
  const [status, setStatus] = useState("idle");
  const timer = useRef(null);

  // Clear timer on unmount
  useEffect(() => () => clearTimeout(timer.current), []);

  // 🔑 Reset status when parent clears the value or it’s too short
  useEffect(() => {
    if (!verifyAsync) return;           // parent drives statusProp in that mode
    if (!value || value.length < minLength) {
      clearTimeout(timer.current);
      setStatus("idle");
    }
  }, [value, verifyAsync, minLength]);

  const handleChange = (e) => {
    onChange?.(e);
    if (!verifyAsync) return;           // statusProp mode

    const v = e.target.value;
    clearTimeout(timer.current);

    if (!v || v.length < minLength) {
      setStatus("idle");
      return;
    }

    setStatus("checking");
    timer.current = setTimeout(async () => {
      try {
        const ok = await verifyAsync(v);
        setStatus(ok ? "good" : "bad");
      } catch {
        setStatus("bad");
      }
    }, debounceMs);
  };

  const s = statusProp ?? status;

  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium mb-1">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          type="password"
          id={id}
          name={name}
          autoComplete={autoComplete}
          value={value}
          onChange={handleChange}
          disabled={disabled}
          placeholder={placeholder}
          className={inputClassName}
        />
        {s === "checking" && (
          <Loader2 size={16} className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />
        )}
        {s === "good" && (
          <Check size={16} className="absolute right-2 top-1/2 -translate-y-1/2 text-green-600" />
        )}
        {s === "bad" && (
          <X size={16} className="absolute right-2 top-1/2 -translate-y-1/2 text-red-600" />
        )}
      </div>
    </div>
  );
}
