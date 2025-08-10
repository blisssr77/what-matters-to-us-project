// Build rules (tri-state for notSameAsCurrent: null until both filled)
export const buildCodeRules = (code, current = "", minLen = 6) => ({
  length: code.length >= minLen,
  noSpace: code.length ? !/\s/.test(code) : false,
  notSameAsCurrent: (!code || !current) ? null : code !== current,
});

export default function VaultCodeChecklist({ rules, className = "" }) {
  const Li = ({ ok, children }) => (
    <li className={ok ? "text-green-600" : "text-gray-500"}>{children}</li>
  );

  return (
    <ul className={`text-xs pl-4 space-y-1 -ml-4 ${className}`}>
      <Li ok={rules.length}>• 6 characters minimum</Li>

    </ul>
  );
}
