import { Check, X, Loader2 } from "lucide-react";

export default function PasswordField({
  label,
  status = "idle",            // "idle" | "checking" | "good" | "bad"
  className = "",
  inputClassName = "",
  ...inputProps               // <- includes autoComplete, name, id, etc.
}) {
  return (
    <div className={className}>
      {label && <label htmlFor={inputProps.id} className="block text-sm font-medium mb-1">{label}</label>}
      <div className="relative">
        <input
          type="password"
          className={`w-full border rounded px-3 py-2 text-sm pr-8 ${inputClassName}`}
          {...inputProps}
        />
        {status === "checking" && (
          <Loader2 size={16} className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />
        )}
        {status === "good" && (
          <Check size={16} className="absolute right-2 top-1/2 -translate-y-1/2 text-green-600" />
        )}
        {status === "bad" && (
          <X size={16} className="absolute right-2 top-1/2 -translate-y-1/2 text-red-600" />
        )}
      </div>
    </div>
  );
}