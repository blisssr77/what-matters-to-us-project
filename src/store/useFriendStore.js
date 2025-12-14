import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useFriendStore = create(
  persist(
    (set, get) => ({
      friends: [],
      loading: false,
      error: null,

      // Optional: selected friend in UI (e.g., right panel)
      selectedFriendId: null,

      setFriends: (friends) =>
        set({
          friends: Array.isArray(friends) ? friends : [],
          error: null,
        }),

      upsertFriend: (friendRow) =>
        set((state) => {
          if (!friendRow || !friendRow.friend_id) return state;

          const idx = state.friends.findIndex(
            (f) => f.friend_id === friendRow.friend_id
          );

          let updatedFriends;
          if (idx === -1) {
            updatedFriends = [...state.friends, friendRow];
          } else {
            updatedFriends = [...state.friends];
            updatedFriends[idx] = {
              ...updatedFriends[idx],
              ...friendRow,
            };
          }

          return { ...state, friends: updatedFriends };
        }),

      toggleFavoriteLocal: (friendRecordId, favorite) =>
        set((state) => {
          const updated = state.friends.map((f) =>
            f.id === friendRecordId
              ? { ...f, favorite, isFavorite: favorite }
              : f
          );
          return { ...state, friends: updated };
        }),

      setSelectedFriendId: (friendId) =>
        set({ selectedFriendId: friendId }),

      setLoading: (loading) => set({ loading }),

      setError: (err) => set({ error: err }),

      clearFriends: () =>
        set({
          friends: [],
          loading: false,
          error: null,
          selectedFriendId: null,
        }),

      // Check if a given profile is already a friend
      // Assumes `friend_id` is the other user's profile id
      isFriend: (profileId) => {
        if (!profileId) return false;
        const { friends } = get();
        return friends.some(
          (f) =>
            f.friend_id === profileId ||
            f.user_id === profileId // in case your schema stores both sides
        );
      },

      // Optional helper: get full friend row by profile id
      getFriendByProfileId: (profileId) => {
        if (!profileId) return null;
        const { friends } = get();
        return (
          friends.find(
            (f) =>
              f.friend_id === profileId ||
              f.user_id === profileId
          ) || null
        );
      },
    }),
    {
      name: "friend-store",
      partialize: (s) => ({
        friends: s.friends,
        selectedFriendId: s.selectedFriendId,
      }),
    }
  )
);
