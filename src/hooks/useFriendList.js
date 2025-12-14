import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import { useFriendStore } from "../store/useFriendStore";

export function useFriendList() {
  const [currentUserId, setCurrentUserId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const { friends, favorites, setFriends, toggleFavoriteLocal } =
    useFriendStore();

  // ========= Auth =========
  useEffect(() => {
    (async () => {
      const { data, error: authErr } = await supabase.auth.getUser();
      if (authErr || !data?.user) {
        setCurrentUserId(null);
        return;
      }
      setCurrentUserId(data.user.id);
    })();
  }, []);

  // ========= Load friends =========
  const loadFriends = useCallback(async () => {
    if (!currentUserId) return;
    setLoading(true);
    setError("");

    try {
      const { data, error: qErr } = await supabase
        .from("friends")
        .select(
          `
          id,
          user_id,
          friend_id,
          status,
          is_favorite:favorite,
          created_at,
          friend:profiles!friends_friend_id_fkey (
            id,
            username,
            email,
            avatar_url
          )
        `
        )
        .eq("user_id", currentUserId);

      if (qErr) {
        console.error("loadFriends error:", qErr);
        setError("Failed to load friends.");
        setLoading(false);
        return;
      }

      const normalized = (data || []).map((row) => ({
        id: row.id,
        friendId: row.friend_id,
        status: row.status,
        isFavorite: !!row.is_favorite, // <-- normalized name
        createdAt: row.created_at,
        profile: row.friend,
      }));

      setFriends(normalized);
    } catch (err) {
      console.error("loadFriends exception:", err);
      setError("Failed to load friends.");
    } finally {
      setLoading(false);
    }
  }, [currentUserId, setFriends]);

  useEffect(() => {
    if (currentUserId) {
      loadFriends();
    }
  }, [currentUserId, loadFriends]);

  // ========= Toggle favorite =========
  const toggleFavorite = useCallback(
    async (friendRecordId, nextValueOptional) => {
      if (!friendRecordId) return;

      // find current value from store
      const friend = friends.find((f) => f.id === friendRecordId);
      const current = friend?.isFavorite ?? false;
      const nextValue =
        typeof nextValueOptional === "boolean"
          ? nextValueOptional
          : !current;

      try {
        const { error: uErr } = await supabase
          .from("friends")
          .update({ favorite: nextValue }) // real column name
          .eq("id", friendRecordId);

        if (uErr) {
          console.error("toggleFavorite error:", uErr);
          return;
        }

        // update local store
        toggleFavoriteLocal(friendRecordId, nextValue);
      } catch (err) {
        console.error("toggleFavorite exception:", err);
      }
    },
    [friends, toggleFavoriteLocal]
  );

  return {
    currentUserId,
    friends,
    favorites,
    loading,
    error,
    loadFriends,
    toggleFavorite,
  };
}