import { useState } from "react";
import bcrypt from "bcryptjs";
import { supabase } from "../../lib/supabaseClient";

export default function InviteModal({ onClose, workspaceId }) {
  const [invitations, setInvitations] = useState([{ identifier: "", role: "viewer" }]);
  const [vaultCode, setVaultCode] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // Handle changes in the invitation rows
  const handleChange = (index, field, value) => {
    const updated = [...invitations];
    updated[index][field] = value;
    setInvitations(updated);
  };

  // Add a new row for invitation
  const addRow = () => {
    setInvitations([...invitations, { identifier: "", role: "viewer" }]);
  };

  // Remove a row from the invitation list
  const removeRow = (index) => {
    setInvitations(invitations.filter((_, i) => i !== index));
  };

  // Handle the invitation logic
  const handleInvite = async () => {
    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id || !workspaceId) {
      setErrorMsg("Authentication or workspace missing.");
      setLoading(false);
      return;
    }

    // Vault code check
    const { data: vaultCodeRow, error: codeError } = await supabase
      .from("vault_codes")
      .select("private_code")
      .eq("id", user.id)
      .single();

    if (codeError || !vaultCodeRow?.private_code) {
      setErrorMsg("Vault code not found.");
      setLoading(false);
      return;
    }

    const isMatch = await bcrypt.compare(vaultCode, vaultCodeRow.private_code);
    if (!isMatch) {
      setErrorMsg("Incorrect Vault Code.");
      setLoading(false);
      return;
    }

    //  Fetch current user’s profile (for invited_by_name)
    const { data: currentProfile } = await supabase
      .from("profiles")
      .select("username, email")
      .eq("id", user.id)
      .single();

    const invitedByName = currentProfile?.username || currentProfile?.email || "Unknown";

    const successList = [];
    for (let invite of invitations) {
      const { identifier, role } = invite;
      if (!identifier.trim()) continue;

      // Find user in profiles table by email or username
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, username, email")
        .or(`email.eq.${identifier},username.eq.${identifier}`)
        .single();

      if (!profile?.id) {
        console.warn(`User not found: ${identifier}`);
        continue;
      }

      // Check if the user is already a member of the workspace
      const { error: inviteError } = await supabase.from("workspace_members").insert({
        user_id: profile.id,
        workspace_id: workspaceId,
        role,
        invited_by: user.id,
        invited_by_name: invitedByName, //  Current user's name/email
      });

      // 🔔 Send in-app notification
      await supabase.from("notifications").insert({
        user_id: profile.id,
        message: `${invitedByName} invited you to a workspace.`,
      });

      if (inviteError) {
        console.error(`Error inviting ${identifier}:`, inviteError.message);
        continue;
      }

      successList.push(identifier);
    }

    if (successList.length > 0) {
      setSuccessMsg(`Successfully invited: ${successList.join(", ")}`);
      setShowSuccessModal(true);
    } else {
      setErrorMsg("No valid users found or invited.");
    }

    setLoading(false);
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black bg-opacity-40 flex items-center justify-center">
        <div className="bg-white p-6 rounded-xl w-full max-w-md shadow-lg relative">
          <button className="absolute top-3 right-3 text-gray-400" onClick={onClose}>✕</button>
          <h2 className="text-lg text-gray-800 font-semibold mb-4">Invite Members</h2>

          {invitations.map((invite, index) => (
            <div key={index} className="mb-3">
              <input
                className="w-full p-2 border rounded mb-1 text-sm text-gray-800"
                placeholder="User Email or Username"
                value={invite.identifier}
                onChange={(e) => handleChange(index, "identifier", e.target.value)}
              />
              <div className="flex gap-2 text-gray-400">
                <select
                  className="w-full p-2 border rounded text-sm"
                  value={invite.role}
                  onChange={(e) => handleChange(index, "role", e.target.value)}
                >
                  <option value="viewer">Viewer - Can view documents</option>
                  <option value="member">Member - Can view/edit documents</option>
                  <option value="admin">Admin - Full access, including inviting members</option>
                </select>
                {invitations.length > 1 && (
                  <button
                    onClick={() => removeRow(index)}
                    className="text-red-500 text-sm"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))}

          <button onClick={addRow} className="text-sm text-green-600 mb-4 font-semibold">
            + Add Another
          </button>

          <input
            type="password"
            className="w-full p-2 border rounded mb-3 text-sm text-gray-800"
            placeholder="Workspace Vault Code"
            value={vaultCode}
            onChange={(e) => setVaultCode(e.target.value)}
          />

          {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}
          {successMsg && <p className="text-sm text-green-600">{successMsg}</p>}

          <button
            className="btn-secondary w-full"
            onClick={handleInvite}
            disabled={loading}
          >
            {loading ? "Inviting..." : "Send Invites"}
          </button>
        </div>
      </div>

      {/*  Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-sm">
            <h3 className="text-lg font-semibold mb-4 text-gray-800">🎉 Invitation Sent!</h3>
            <p className="text-sm text-gray-800 mb-4">{successMsg}</p>
            <button
              onClick={() => {
                setShowSuccessModal(false);
                onClose();
              }}
              className="w-full bg-green-600 text-white py-2 px-4 rounded"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
}