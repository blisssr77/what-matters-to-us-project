import React, { useMemo, useState } from "react";
import { UserPlus, X } from "lucide-react";
import { useFriendList } from "../../../hooks/useFriendList";
import FavoriteList from "./FavoriteList";
import FriendList from "./FriendList";
import AddFriendModal from "../Modals/AddFriendModal";
import ProfileModal from "../Modals/ProfileModal";

export default function FriendSidebar({ onOpenChatWithUserId, onClose }) {
  const { favorites, friends, loading, error, refresh, toggleFavorite } = useFriendList();

  const [search, setSearch] = useState("");
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [profileModalFriend, setProfileModalFriend] = useState(null);

  const normalizedSearch = search.trim().toLowerCase();

  const filteredFavorites = useMemo(() => {
    if (!normalizedSearch) return favorites || [];
    return (favorites || []).filter((f) => {
      const p = f.profile || {};
      const name =
        p.username || p.full_name || p.email || p.display_name || "";
      return name.toLowerCase().includes(normalizedSearch);
    });
  }, [favorites, normalizedSearch]);

  const filteredFriends = useMemo(() => {
    if (!normalizedSearch) return friends || [];
    return (friends || []).filter((f) => {
      const p = f.profile || {};
      const name =
        p.username || p.full_name || p.email || p.display_name || "";
      return name.toLowerCase().includes(normalizedSearch);
    });
  }, [friends, normalizedSearch]);

  const handleFriendClick = (friend) => {
    const profileId = friend?.profile?.id || friend?.friendId || friend?.friend_id;
    if (onOpenChatWithUserId && profileId) {
      onOpenChatWithUserId(profileId);
    }
  };

  const handleOpenProfile = (friend) => {
    setProfileModalFriend(friend || null);
  };

  const handleToggleFavorite = (friend) => {
    if (!friend?.id) return;
    const current = friend.isFavorite ?? friend.is_favorite ?? false;
    const next = !current;
    toggleFavorite(friend.id, next);
  };

  const handleStartChatFromProfile = () => {
    if (!profileModalFriend) return;
    const profileId =
      profileModalFriend?.profile?.id ||
      profileModalFriend?.friendId ||
      profileModalFriend?.friend_id;

    if (onOpenChatWithUserId && profileId) {
      onOpenChatWithUserId(profileId);
      setProfileModalFriend(null);    // close modal
    }
  };

  const isEmpty =
    !loading &&
    (!filteredFavorites?.length && !filteredFriends?.length && !error);

  return (
    <>
      <aside className="flex h-full w-72 flex-col border-r border-slate-800 bg-slate-950/95 text-slate-50">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800/80 bg-slate-950">
          <div className="flex items-center gap-2">
            <span className="h-6 w-6 rounded-full bg-emerald-500/10 text-emerald-300 flex items-center justify-center text-xs font-semibold">
              👥
            </span>
            <div className="flex flex-col leading-tight">
              <span className="text-xs font-semibold tracking-tight">
                People
              </span>
              <span className="text-[10px] text-slate-400">
                Friends · Favorites
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowAddFriend(true)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-emerald-500/70 bg-emerald-500/20 text-emerald-200 text-[11px] hover:bg-emerald-500/30 hover:border-emerald-400 transition"
              title="Add friend"
            >
              <UserPlus size={13} />
            </button>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-700 bg-slate-900/80 text-slate-300 hover:bg-slate-800 hover:border-slate-500 text-[11px]"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-slate-800/70">
          <input
            className="w-full rounded-md border border-slate-700 bg-slate-900/60 px-2 py-1.5 text-xs text-slate-50 placeholder:text-slate-500"
            placeholder="Search people…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-3">
          {loading && (
            <div className="px-1 text-[11px] text-slate-500">
              Loading friends…
            </div>
          )}

          {error && (
            <div className="px-1 text-[11px] text-red-400">
              Could not load friends.{" "}
              <button
                type="button"
                onClick={refresh}
                className="underline hover:text-red-300"
              >
                Retry
              </button>
            </div>
          )}

          {filteredFavorites?.length > 0 && (
            <FavoriteList
              favorites={filteredFavorites}
              onClickFriend={handleFriendClick}
              onOpenProfile={handleOpenProfile}
              onToggleFavorite={handleToggleFavorite}
            />
          )}

          <FriendList
            friends={filteredFriends}
            onClickFriend={handleFriendClick}
            onOpenProfile={handleOpenProfile}
            onToggleFavorite={handleToggleFavorite}
          />

          {isEmpty && (
            <div className="mt-4 rounded-md border border-dashed border-slate-700 bg-slate-900/60 px-3 py-2 text-[11px] text-slate-400">
              No friends yet. Add teammates to quickly start direct messages
              and share workspaces.
            </div>
          )}
        </div>
      </aside>

      {/* Modals */}
      {showAddFriend && (
        <AddFriendModal
          onClose={() => setShowAddFriend(false)}
          onFriendAdded={() => {
            refresh?.();
          }}
        />
      )}

      {profileModalFriend && (
        <ProfileModal
          profile={profileModalFriend.profile}
          isFriend={true}
          isFavorite={!!profileModalFriend.isFavorite}
          onClose={() => setProfileModalFriend(null)}
          onStartChat={handleStartChatFromProfile}
          onToggleFavorite={() => handleToggleFavorite(profileModalFriend)}
        />
      )}
    </>
  );
}
