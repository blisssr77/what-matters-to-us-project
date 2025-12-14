import React from "react";
import { Star } from "lucide-react";

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

export default function FavoriteList({
  favorites,
  onClickFriend,
  onOpenProfile,
  onToggleFavorite,
}) {
  if (!favorites?.length) return null;

  return (
    <section>
      <div className="mb-1 flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          <Star size={12} className="text-amber-400" />
          <span className="text-[11px] font-semibold tracking-wide text-slate-200">
            Favorites
          </span>
        </div>
        <span className="text-[10px] text-slate-500">
          {favorites.length} pinned
        </span>
      </div>

      <div className="space-y-1.5">
        {favorites.map((f) => {
          const displayName = getDisplayName(f);
          const initials = getInitialsFromFriend(f);
          const email = f?.profile?.email;

          return (
            <button
              key={f.id}
              type="button"
              onClick={() => onClickFriend?.(f)}
              className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-slate-900/80"
            >
              <div className="relative">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500/20 text-[11px] font-semibold text-amber-200">
                  {initials}
                </div>
                <button
                  type="button"
                  title="Unfavorite"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite?.(f);
                  }}
                  className="absolute -right-1 -bottom-1 flex h-4 w-4 items-center justify-center rounded-full bg-slate-950 text-amber-400 shadow-sm"
                >
                  <Star size={10} fill="currentColor" />
                </button>
              </div>

              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-medium text-slate-50">
                    {displayName}
                  </span>
                </div>
                {email && (
                  <span className="truncate text-[10px] text-slate-400">
                    {email}
                  </span>
                )}
              </div>

              <button
                type="button"
                className="text-[10px] text-slate-500 opacity-0 group-hover:opacity-100 hover:text-slate-200"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenProfile?.(f);
                }}
              >
                View
              </button>
            </button>
          );
        })}
      </div>
    </section>
  );
}
