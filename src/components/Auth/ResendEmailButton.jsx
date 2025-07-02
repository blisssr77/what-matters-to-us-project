import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";

export default function ResendEmailButton() {
  const [status, setStatus] = useState("");

  const handleResend = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const email = session?.user?.email;
    if (!email) return;

    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
    });

    if (error) {
      setStatus("❌ Failed to resend. Try again.");
    } else {
      setStatus("✅ Email sent!");
    }
  };

  return (
    <div>
      <button
        onClick={handleResend}
        className="mt-2 px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600"
      >
        Resend Confirmation Email
      </button>
      {status && <p className="text-sm mt-2">{status}</p>}
    </div>
  );
}
