import { useState } from "react";
import bcrypt from "bcryptjs";
import { supabase } from "../../lib/supabaseClient";''
import { useEffect } from "react";

export default function InviteModal({ onClose, workspaceId }) {
  const [invitations, setInvitations] = useState([
    { identifier: "", role: "viewer", visibility: "workspace" },
  ]);
  const [vaultCode, setVaultCode] = useState("");
  const [inviteMessage, setInviteMessage] = useState(""); // 👈 optional message
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const [workspaceName, setWorkspaceName] = useState("");
    useEffect(() => {
    (async () => {
      if (!workspaceId) return;
      const { data } = await supabase
        .from("workspaces")
        .select("name")
        .eq("id", workspaceId)
        .single();

      setWorkspaceName(data?.name || "");
    })();
  }, [workspaceId]);

  // Handle changes in the invitation rows
  const handleChange = (index, field, value) => {
    const updated = [...invitations];
    updated[index][field] = value;
    setInvitations(updated);
  };

  // Add a new row for invitation
  const addRow = () => {
    setInvitations([
      ...invitations,
      { identifier: "", role: "viewer", visibility: "workspace" },
    ]);
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

    // Fetch current user’s profile (for invited_by_name)
    const { data: currentProfile } = await supabase
      .from("profiles")
      .select("username, email")
      .eq("id", user.id)
      .single();

    const invitedByName =
      currentProfile?.username || currentProfile?.email || "Unknown";

    // Optional workspace name for message metadata
    const { data: ws } = await supabase
      .from("workspaces")
      .select("name")
      .eq("id", workspaceId)
      .single();

    const workspaceName = ws?.name || "this workspace";

    const successList = [];
    for (let invite of invitations) {
      const { identifier, role, visibility } = invite;
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

      const normalizedRole = role === "viewer" ? "guest" : role; // 'member', 'admin' pass through

      // Insert into workspace_members
      const { error: inviteError } = await supabase
        .from("workspace_members")
        .insert({
          user_id: profile.id,
          workspace_id: workspaceId,
          role: normalizedRole,
          visibility,
          invited_by: user.id,
          invited_by_name: invitedByName,
          workspace_name: workspaceName,
        });

      if (inviteError) {
        console.error(`Error inviting ${identifier}:`, inviteError.message);
        continue;
      }

      // 🔔 Send in-app notification
      await supabase.from("notifications").insert({
        user_id: profile.id,
        message: `${invitedByName} invited you to a workspace.`,
      });

      // 💬 Messenger integration (best-effort: failures won't block the invite)
      try {
        // 1) Create a direct conversation for this workspace
        const { data: conversation, error: convError } = await supabase
          .from("conversations")
          .insert({
            type: "direct",
            workspace_id: workspaceId,
            created_by: user.id,
            title: null,
          })
          .select("id")
          .single();

        if (convError || !conversation?.id) {
          console.error("Error creating conversation:", convError);
        } else {
          const conversationId = conversation.id;

          // 2) Add both users as members
          const { error: membersError } = await supabase
            .from("conversation_members")
            .insert([
              { conversation_id: conversationId, user_id: user.id },
              { conversation_id: conversationId, user_id: profile.id },
            ]);

          if (membersError) {
            console.error("Error adding conversation members:", membersError);
          } else {
            // 3) Build the invitation message text
            const baseBody = `${invitedByName} invited you to join workspace "${workspaceName}".`;
            const trimmedNote = inviteMessage.trim();
            const fullBody = trimmedNote
              ? `${baseBody}\n\nNote from ${invitedByName}:\n${trimmedNote}`
              : baseBody;

            // 4) Insert a system message into Messenger
            const { error: msgError } = await supabase
              .from("messages")
              .insert({
                conversation_id: conversationId,
                sender_id: user.id,
                kind: "system",
                body: fullBody,
                metadata: {
                  type: "workspace_invite",
                  workspace_id: workspaceId,
                  invited_by: user.id,
                  invited_by_name: invitedByName,
                  role: normalizedRole,
                  visibility,
                },
              });

            if (msgError) {
              console.error("Error inserting invite message:", msgError);
            } else {
              // 5) Update conversation last_message_* for list preview
              const nowIso = new Date().toISOString();
              const preview = fullBody.slice(0, 200);
              const { error: convUpdateError } = await supabase
                .from("conversations")
                .update({
                  last_message_preview: preview,
                  last_message_at: nowIso,
                })
                .eq("id", conversationId);

              if (convUpdateError) {
                console.error(
                  "Error updating conversation last_message:",
                  convUpdateError
                );
              }
            }
          }
        }
      } catch (err) {
        console.error("Messenger invite flow failed:", err);
        // do not block the overall invite flow
      }

      successList.push(identifier);
    }

    if (successList.length > 0) {
      setSuccessMsg(`Successfully invited: ${successList.join(", ")}`);
      setShowSuccessModal(true);
      // Optionally clear message after success
      setInviteMessage("");
    } else {
      setErrorMsg("No valid users found or invited.");
    }

    setLoading(false);
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black bg-opacity-40 flex items-center justify-center">
        <div className="bg-white p-6 rounded-xl w-full max-w-md shadow-lg relative">
          <button
            className="absolute top-3 right-3 text-gray-400"
            onClick={onClose}
          >
            ✕
          </button>
          <h2 className="text-lg text-gray-800 font-semibold">
            Invite Members
          </h2>
          <div className="mb-4 px-3 py-1.5 rounded bg-slate-50 border border-slate-200 text-xs text-slate-600">
            You’re inviting members to:
            <span className="font-semibold text-slate-700 ml-1">Workspace: {workspaceName}</span>
          </div>

          
          <p className="text-xs text-gray-500 mb-4">
            Set each member's role and visibility inside this workspace.
          </p>

          {invitations.map((invite, index) => (
            <div key={index} className="mb-3 border-b border-slate-100 pb-3">
              <input
                className="w-full p-2 border rounded mb-2 text-sm text-gray-800"
                placeholder="User Email or Username"
                value={invite.identifier}
                onChange={(e) =>
                  handleChange(index, "identifier", e.target.value)
                }
              />
              <div className="flex gap-2 text-gray-400">
                <select
                  className="w-1/2 p-2 border rounded text-xs"
                  value={invite.role}
                  onChange={(e) =>
                    handleChange(index, "role", e.target.value)
                  }
                >
                  <option value="viewer">Guest – View only</option>
                  <option value="member">Member – View &amp; edit</option>
                  <option value="admin">Admin – Full access</option>
                </select>

                <select
                  className="w-1/2 p-2 border rounded text-xs"
                  value={invite.visibility}
                  onChange={(e) =>
                    handleChange(index, "visibility", e.target.value)
                  }
                >
                  <option value="workspace">
                    Workspace – All workspace items
                  </option>
                  <option value="assigned">
                    Assigned – Only items shared with them
                  </option>
                </select>

                {invitations.length > 1 && (
                  <button
                    onClick={() => removeRow(index)}
                    className="text-red-500 text-sm px-1"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))}

          <button
            onClick={addRow}
            className="text-sm text-green-600 mb-4 font-semibold"
          >
            + Add Another
          </button>

          {/* Optional invite message box (goes into Messenger) */}
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Add a note to your invite (optional)
          </label>
          <textarea
            className="w-full p-2 border rounded mb-3 text-sm text-gray-800 resize-none h-20"
            placeholder="Hey! I’d love to collaborate with you in this workspace..."
            value={inviteMessage}
            onChange={(e) => setInviteMessage(e.target.value)}
          />

          <input
            type="password"
            className="w-full p-2 border rounded mb-2 text-sm text-gray-800"
            placeholder="Workspace Vault Code"
            value={vaultCode}
            onChange={(e) => setVaultCode(e.target.value)}
          />
          <p className="text-[11px] text-gray-500 mb-3">
            For security, invites require your Workspace Vault Code before
            adding new members.
          </p>

          {errorMsg && <p className="text-sm text-red-600 mb-2">{errorMsg}</p>}
          {successMsg && (
            <p className="text-sm text-green-600 mb-2">{successMsg}</p>
          )}

          <button
            className="btn-secondary w-full"
            onClick={handleInvite}
            disabled={loading}
          >
            {loading ? "Inviting..." : "Send Invites"}
          </button>
        </div>
      </div>

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-sm">
            <h3 className="text-lg font-semibold mb-4 text-gray-800">
              🎉 Invitation Sent!
            </h3>
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
