export default function PasswordChecklist({ rules, className = "" }) {
  const Item = ({ ok, children }) => (
    <li className={ok ? "text-green-600" : "text-gray-500"}>{children}</li>
  );

  return (
    <ul className={`text-xs pl-4 space-y-1 ${className}`}>
      <Item ok={rules.lower}>One lowercase character</Item>
      <Item ok={rules.upper}>One uppercase character</Item>
      <Item ok={rules.number}>One number</Item>
      <Item ok={rules.special}>One special character</Item>
      <Item ok={rules.length}>8 characters minimum</Item>
      <li className={rules.notSameAsCurrent ? "text-green-600" : "text-red-600"}>
        Not the same as current password
      </li>
    </ul>
  );
}
