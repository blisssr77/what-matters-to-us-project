import React from "react";

export default function ProfileModal({
  profile,
  isFriend = false,
  isFavorite = false,
  onClose,
  onStartChat,
  onAddFriend,
  onToggleFavorite,
}) {
  if (!profile) return null;

  const displayName = profile.username || profile.full_name || profile.email;
  const initials =
    displayName
      ?.trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0])
      .join("")
      .toUpperCase() || "?";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45">
      <div className="relative w-full max-w-sm rounded-2xl bg-slate-950 text-slate-50 shadow-2xl border border-slate-800/70 p-5">
        <button
          className="absolute right-3 top-3 text-sm text-slate-500 hover:text-slate-200"
          onClick={onClose}
        >
          ✕
        </button>

        <div className="mb-4 flex items-center gap-3">
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={displayName}
              className="h-12 w-12 rounded-full object-cover border border-slate-700"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 text-sm font-semibold">
              {initials}
            </div>
          )}

          <div className="flex flex-col">
            <span className="text-sm font-semibold">{displayName}</span>
            {profile.email && (
              <span className="text-[11px] text-slate-400">
                {profile.email}
              </span>
            )}
          </div>
        </div>

        {profile.bio && (
          <div className="mb-4 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-[11px] text-slate-200">
            {profile.bio}
          </div>
        )}

        <div className="mb-3 flex flex-wrap gap-2">
          {onStartChat && (
            <button
              type="button"
              onClick={() => {
                console.log("[ProfileModal] Message clicked");
                onStartChat();
              }}
              className="flex-1 rounded-md bg-emerald-500 px-3 py-1.5 text-[11px] font-semibold text-slate-950 hover:bg-emerald-400"
            >
              Message
            </button>
          )}

          {onAddFriend && !isFriend && (
            <button
              type="button"
              onClick={onAddFriend}
              className="flex-1 rounded-md border border-slate-600 bg-slate-900/60 px-3 py-1.5 text-[11px] font-semibold text-slate-100 hover:bg-slate-800"
            >
              Add friend
            </button>
          )}

          {onToggleFavorite && isFriend && (
            <button
              type="button"
              onClick={onToggleFavorite}
              className={`flex-1 rounded-md border px-3 py-1.5 text-[11px] font-semibold transition ${
                isFavorite
                  ? "border-amber-400 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                  : "border-slate-600 bg-slate-900/60 text-slate-100 hover:bg-slate-800"
              }`}
            >
              {isFavorite ? "Remove favorite" : "Add to favorites"}
            </button>
          )}
        </div>

        <p className="text-[10px] text-slate-500">
          Profile data is shared across Messenger and workspaces. Updating your
          avatar or name in Manage Account will update it everywhere.
        </p>
      </div>
    </div>
  );
}
