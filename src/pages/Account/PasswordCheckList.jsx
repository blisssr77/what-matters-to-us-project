export default function PasswordChecklist({ rules, className = "" }) {
  const Item = ({ ok, children }) => (
    <li className={ok ? "text-green-600" : "text-gray-500"}>{children}</li>
  );

  return (
    <ul className={`text-xs pl-4 space-y-1 ${className} -ml-3`}>
        <li className={rules.lower ? "text-green-600" : "text-gray-500"}>• One lowercase character</li>
        <li className={rules.upper ? "text-green-600" : "text-gray-500"}>• One uppercase character</li>
        <li className={rules.number ? "text-green-600" : "text-gray-500"}>• One number</li>
        <li className={rules.special ? "text-green-600" : "text-gray-500"}>• One special character</li>
        <li className={rules.length ? "text-green-600" : "text-gray-500"}>• 8 characters minimum</li>

        <li
            className={
            rules.notSameAsCurrent === null
                ? "text-gray-500"
                : rules.notSameAsCurrent
                ? "text-green-600"
                : "text-red-600"
            }
        >
            • Not the same as current password
        </li>
    </ul>
  );
}
