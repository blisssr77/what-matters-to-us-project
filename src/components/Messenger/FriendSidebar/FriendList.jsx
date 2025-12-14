import React from "react";
import { Users, Star } from "lucide-react";

function getDisplayName(friend) {
  const p = friend?.profile || {};
  return p.username || p.full_name || p.email || "Unknown";
}

function getInitialsFromFriend(friend) {
  const name = getDisplayName(friend);
  const parts = name.trim().split(/\s+/);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function FriendList({
  friends,
  onClickFriend,
  onOpenProfile,
  onToggleFavorite,
}) {
  return (
    <section>
      <div className="mb-1 flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          <Users size={12} className="text-slate-300" />
          <span className="text-[11px] font-semibold tracking-wide text-slate-200">
            All friends
          </span>
        </div>
        <span className="text-[10px] text-slate-500">
          {friends?.length || 0} total
        </span>
      </div>

      {friends?.length ? (
        <div className="space-y-1">
          {friends.map((f) => {
            const displayName = getDisplayName(f);
            const initials = getInitialsFromFriend(f);
            const email = f?.profile?.email;
            const isFavorite = !!(f.isFavorite ?? f.is_favorite);

            return (
              <button
                key={f.id}
                type="button"
                onClick={() => onClickFriend?.(f)}
                className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-slate-900/80"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-800 text-[11px] font-semibold text-slate-100">
                  {initials}
                </div>

                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-medium text-slate-50">
                      {displayName}
                    </span>
                    {isFavorite && (
                      <Star
                        size={10}
                        className="shrink-0 text-amber-400 opacity-70"
                        fill="currentColor"
                      />
                    )}
                  </div>
                  {email && (
                    <span className="truncate text-[10px] text-slate-400">
                      {email}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100">
                  {/* View profile – span instead of button */}
                  <span
                    className="text-[10px] text-slate-500 hover:text-slate-200 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenProfile?.(f);
                    }}
                  >
                    View
                  </span>

                  {/* Favorite toggle – span instead of button */}
                  <span
                    title={isFavorite ? "Unfavorite" : "Add to favorites"}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleFavorite?.(f);
                    }}
                    className="text-[10px] text-slate-500 hover:text-amber-300 cursor-pointer"
                  >
                    <Star
                      size={11}
                      className={isFavorite ? "text-amber-300" : "text-slate-500"}
                      fill={isFavorite ? "currentColor" : "none"}
                    />
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="px-1 py-2 text-[11px] text-slate-500">
          No friends added yet.
        </div>
      )}
    </section>
  );
}
