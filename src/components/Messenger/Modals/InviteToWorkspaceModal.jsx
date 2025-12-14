import React, { useState } from "react";
import bcrypt from "bcryptjs";
import { supabase } from "../../../lib/supabaseClient";
import { sendMessage } from "../../../lib/messenger/sendMessage";

export default function InviteToWorkspaceModal({
  onClose,
  workspaceId,
  fromMessenger = false,
  chatId = null,
  targetProfileId = null,
}) {
  const [vaultCode, setVaultCode] = useState("");
  const [note, setNote] = useState(
    "I’d love to collaborate with you in this workspace. You’ll be able to view and work on shared docs and vaults."
  );
  const [role, setRole] = useState("member"); // default more powerful inside messenger
  const [visibility, setVisibility] = useState("workspace");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const handleInvite = async () => {
    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const {
        data: { user },
        error: authErr,
      } = await supabase.auth.getUser();
      if (authErr || !user?.id) {
        setErrorMsg("Authentication failed. Please sign in again.");
        return;
      }
      if (!workspaceId || !targetProfileId) {
        setErrorMsg("Workspace or target user missing.");
        return;
      }

      // 1) Verify Vault Code
      const { data: vaultRow, error: codeErr } = await supabase
        .from("vault_codes")
        .select("private_code")
        .eq("id", user.id)
        .single();

      if (codeErr || !vaultRow?.private_code) {
        setErrorMsg("Vault Code not set. Please configure it in Manage Account.");
        return;
      }

      const ok = await bcrypt.compare(vaultCode, vaultRow.private_code);
      if (!ok) {
        setErrorMsg("Incorrect Vault Code.");
        return;
      }

      // 2) Fetch inviter profile for display name
      const { data: currentProfile } = await supabase
        .from("profiles")
        .select("username, email")
        .eq("id", user.id)
        .single();

      const invitedByName =
        currentProfile?.username || currentProfile?.email || "Unknown";

      const normalizedRole = role === "viewer" ? "guest" : role;

      // 3) Insert workspace_members row
      const { error: inviteErr } = await supabase
        .from("workspace_members")
        .insert({
          user_id: targetProfileId,
          workspace_id: workspaceId,
          role: normalizedRole,
          visibility,
          invited_by: user.id,
          invited_by_name: invitedByName,
        });

      if (inviteErr) {
        console.error("❌ workspace invite error:", inviteErr);
        setErrorMsg("Failed to add member. They might already be in this workspace.");
        return;
      }

      // 4) Notification row (in-app)
      await supabase.from("notifications").insert({
        user_id: targetProfileId,
        message: `${invitedByName} invited you to a workspace.`,
      });

      // 5) If opened from Messenger with known chatId, send invite-type message
      if (fromMessenger && chatId && targetProfileId) {
        try {
          const text = note?.trim() || "You’ve been invited to join my workspace.";
          await sendMessage({
            chatId,
            senderId: user.id,
            text,
            messageType: "invite",
            inviteWorkspaceId: workspaceId,
          });
        } catch (err) {
          console.error("❌ messenger invite message failed:", err);
          // not fatal – workspace member already added
        }
      }

      setSuccessMsg("Invitation sent successfully.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
          <button
            className="absolute right-3 top-3 text-sm text-slate-400 hover:text-slate-600"
            onClick={onClose}
          >
            ✕
          </button>

          <h2 className="mb-1 text-lg font-semibold text-slate-900">
            Invite to Workspace
          </h2>
          <p className="mb-3 text-xs text-slate-500">
            This will add the recipient to your active workspace and (optionally) drop an invite message into this chat.
          </p>

          <div className="mb-3 grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-600">
                Role
              </label>
              <select
                className="w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-800"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                <option value="member">Member – View & edit</option>
                <option value="admin">Admin – Full access</option>
                <option value="viewer">Guest – View only</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-600">
                Visibility
              </label>
              <select
                className="w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-800"
                value={visibility}
                onChange={(e) => setVisibility(e.target.value)}
              >
                <option value="workspace">
                  Workspace – All workspace items
                </option>
                <option value="assigned">
                  Assigned – Only items shared with them
                </option>
              </select>
            </div>
          </div>

          <label className="mb-1 block text-[11px] font-medium text-slate-600">
            Personal note (optional)
          </label>
          <textarea
            className="mb-3 h-20 w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-800"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a short message that will appear in Messenger with the invite…"
          />

          <label className="mb-1 block text-[11px] font-medium text-slate-600">
            Workspace Vault Code
          </label>
          <input
            type="password"
            className="mb-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm text-slate-800"
            placeholder="Enter your Vault Code to confirm"
            value={vaultCode}
            onChange={(e) => setVaultCode(e.target.value)}
          />
          <p className="mb-3 text-[11px] text-slate-500">
            For security, invites require your Workspace Vault Code.
          </p>

          {errorMsg && (
            <p className="mb-2 text-xs text-red-600">{errorMsg}</p>
          )}
          {successMsg && (
            <p className="mb-2 text-xs text-emerald-600">{successMsg}</p>
          )}

          <button
            onClick={handleInvite}
            disabled={loading}
            className="mt-1 w-full rounded-md bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {loading ? "Sending invite…" : "Send Workspace Invite"}
          </button>
        </div>
      </div>
    </>
  );
}
