import React, { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

export default function AddFriendModal({
  onClose,
  preselectedUserId = null,
  onFriendAdded,
}) {
  const [identifier, setIdentifier] = useState("");
  const [targetProfile, setTargetProfile] = useState(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // If opened from a chat with known profile id, fetch that profile
  useEffect(() => {
    if (!preselectedUserId) return;

    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, email, avatar_url")
        .eq("id", preselectedUserId)
        .single();

      if (error) {
        console.error("❌ failed to load friend profile:", error);
        setErrorMsg("Could not load user information.");
      } else {
        setTargetProfile(data);
        // show something friendly in disabled input
        setIdentifier(data.username || data.email || "");
      }
    })();
  }, [preselectedUserId]);

  const handleResolveTarget = async () => {
    setErrorMsg("");

    if (targetProfile && preselectedUserId) return targetProfile;

    const trimmed = identifier.trim();
    if (!trimmed) {
      setErrorMsg("Enter an email or username.");
      return null;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, email, avatar_url")
      .or(`email.eq.${trimmed},username.eq.${trimmed}`)
      .single();

    if (error || !data?.id) {
      console.error("❌ friend lookup failed:", error);
      setErrorMsg("User not found. Check spelling or try a different identifier.");
      return null;
    }

    setTargetProfile(data);
    return data;
  };

  const handleAddFriend = async () => {
    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const {
        data: { user },
        error: authErr,
      } = await supabase.auth.getUser();

      if (authErr || !user?.id) {
        setErrorMsg("Authentication error. Please sign in again.");
        return;
      }

      const me = user.id;
      const target = await handleResolveTarget();
      if (!target) return;
      if (target.id === me) {
        setErrorMsg("You can’t add yourself as a friend.");
        return;
      }

      // Insert mutual friendship rows (user -> friend, friend -> user)
      const { data: rows, error } = await supabase
        .from("friends")
        .insert([
          {
            user_id: me,
            friend_id: target.id,
            favorite: isFavorite,
            status: "accepted",
            note: note?.trim() || null,
          },
          {
            user_id: target.id,
            friend_id: me,
            favorite: false,
            status: "accepted",
          },
        ])
        .select("*");

      if (error) {
        console.error("❌ add friend error:", error);
        if (error.code === "23505") {
          setErrorMsg("You’re already friends with this user.");
        } else {
          setErrorMsg("Could not add friend. Please try again.");
        }
        return;
      }

      setSuccessMsg("Friend added successfully.");
      if (onFriendAdded && rows && rows[0]) {
        onFriendAdded(rows[0], target);
      }
    } finally {
      setLoading(false);
    }
  };

  const displayName =
    targetProfile?.username || targetProfile?.email || identifier || "New friend";

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45">
        <div className="relative w-full max-w-sm rounded-2xl bg-slate-950 text-slate-50 shadow-2xl border border-slate-800/70 p-5">
          <button
            className="absolute right-3 top-3 text-slate-500 hover:text-slate-200 text-sm"
            onClick={onClose}
          >
            ✕
          </button>

          <h2 className="mb-1 text-base font-semibold tracking-tight">
            Add friend
          </h2>
          <p className="mb-4 text-[11px] text-slate-400">
            Friends make it faster to start direct chats and share workspaces.
          </p>

          {/* Avatar + name preview */}
          <div className="mb-3 flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-slate-800 flex items-center justify-center text-xs font-semibold uppercase">
              {displayName
                .split(/\s+/)
                .slice(0, 2)
                .map((p) => p[0])
                .join("")}
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-medium">{displayName}</span>
              {targetProfile?.email && (
                <span className="text-[11px] text-slate-400">
                  {targetProfile.email}
                </span>
              )}
            </div>
          </div>

          {/* Identifier input (hidden if we already know user id) */}
          {!preselectedUserId && (
            <div className="mb-3">
              <label className="mb-1 block text-[11px] font-medium text-slate-300">
                Email or username
              </label>
              <input
                className="w-full rounded-md border border-slate-700 bg-slate-900/60 px-2 py-1.5 text-xs text-slate-50 placeholder:text-slate-500"
                placeholder="teammate@company.com or @username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
              />
            </div>
          )}

          <div className="mb-3">
            <label className="mb-1 block text-[11px] font-medium text-slate-300">
              Short note (optional)
            </label>
            <textarea
              className="h-16 w-full rounded-md border border-slate-700 bg-slate-900/60 px-2 py-1.5 text-xs text-slate-50 placeholder:text-slate-500"
              placeholder="Hey, let’s stay connected in Messenger."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <label className="mb-3 flex items-center gap-2 text-[11px] text-slate-300">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 rounded border-slate-500 bg-slate-900"
              checked={isFavorite}
              onChange={(e) => setIsFavorite(e.target.checked)}
            />
            Add to favorites
          </label>

          {errorMsg && (
            <p className="mb-2 text-[11px] text-red-400">{errorMsg}</p>
          )}
          {successMsg && (
            <p className="mb-2 text-[11px] text-emerald-400">{successMsg}</p>
          )}

          <button
            type="button"
            onClick={handleAddFriend}
            disabled={loading}
            className="mt-1 w-full rounded-md bg-emerald-500 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
          >
            {loading ? "Adding…" : "Add friend"}
          </button>
        </div>
      </div>
    </>
  );
}
