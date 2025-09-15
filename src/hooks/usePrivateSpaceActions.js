import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export const usePrivateSpaceActions = ({
  activeSpaceId,
  spaceName,
  setSpaceName,
}) => {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // auto-clear success message
  useEffect(() => {
    if (!successMsg) return;
    const t = setTimeout(() => setSuccessMsg(""), 3000);
    return () => clearTimeout(t);
  }, [successMsg]);

  const handleRenameSpace = async () => {
    if (!activeSpaceId || !spaceName?.trim()) return;
    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    const { error } = await supabase
      .from("private_spaces")
      .update({ name: spaceName.trim() })
      .eq("id", activeSpaceId);

    if (error) {
      setErrorMsg("❌ Failed to rename private space.");
    } else {
      setSuccessMsg(" Private space renamed.");
    }
    setLoading(false);
  };

  // Optional helper your modal can call before destructive actions
  const verifyUserPrivateVaultCode = async (code) => {
    if (!code?.trim()) return false;
    const { data, error } = await supabase.rpc("verify_user_private_code", {
      p_code: code.trim(),
    });
    if (error) {
      setErrorMsg(error.message || "Failed to verify Vault Code.");
      return false;
    }
    return !!data;
  };

  // Purge all objects under a prefix (recursively) in a bucket.
  // Example: await purgePrefix("workspace.vaulted", `${workspaceId}`);
  async function purgePrefix(bucket, prefix) {
    // normalize: no leading slash, no trailing slash
    const base = String(prefix || "").replace(/^\/+|\/+$/g, "");

    async function listOnce(dir) {
      const { data, error } = await supabase.storage
        .from(bucket)
        .list(dir || "", { limit: 1000, sortBy: { column: "name", order: "asc" } });
      if (error) throw error;
      return data || [];
    }

    const queue = [base];
    const pathsToDelete = [];

    while (queue.length) {
      const current = queue.pop(); // e.g. "workspaceId" or "workspaceId/subfolder"
      const entries = await listOnce(current);

      for (const entry of entries) {
        const fullPath = current ? `${current}/${entry.name}` : entry.name;

        // Folders come through with no metadata; files have metadata
        if (entry.metadata) {
          pathsToDelete.push(fullPath);
        } else {
          queue.push(fullPath); // recurse
        }
      }
    }

    // Batch deletes so we don't hit payload limits
    while (pathsToDelete.length) {
      const chunk = pathsToDelete.splice(0, 100);
      const { error } = await supabase.storage.from(bucket).remove(chunk);
      if (error) {
        // Not a blocker for the rest; log and continue
        console.warn(`Storage remove warning for ${bucket}:`, error);
      }
    }
  }

  const handleDeleteSpace = async () => {
    if (!activeSpaceId) return false;
    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      // 1) Fetch items FIRST (so we can remove files from storage)
      const { data: items, error: itemsErr } = await supabase
        .from("private_vault_items")
        .select("id, is_vaulted, file_metas")
        .eq("private_space_id", activeSpaceId);

      if (itemsErr) throw itemsErr;

      // 2) Collect storage paths by bucket
      const publicPaths = [];
      const vaultedPaths = [];

      for (const row of items || []) {
        for (const meta of row.file_metas || []) {
          if (!meta?.path) continue;
          if (row.is_vaulted) vaultedPaths.push(meta.path);
          else publicPaths.push(meta.path);
        }
      }

      // 3) Remove files from storage (ignore 404s)
      if (publicPaths.length) {
        const { error } = await supabase.storage
          .from("private.public")
          .remove(publicPaths);
        if (error) console.warn("Storage delete (public) warning:", error);
      }
      if (vaultedPaths.length) {
        const { error } = await supabase.storage
          .from("private.vaulted")
          .remove(vaultedPaths);
        if (error) console.warn("Storage delete (vaulted) warning:", error);
      }

      /** Backstop: purge everything under the space prefix
       *  Requires the SELECT policy shown above.
       */
      await purgePrefix("private.public", `${activeSpaceId}`);
      await purgePrefix("private.vaulted", `${activeSpaceId}`);

      // 4) Delete rows
      // If you already have FK ON DELETE CASCADE from private_vault_items.private_space_id
      // to private_spaces(id), you can skip the explicit child delete below.
      const { error: itemsDelErr } = await supabase
        .from("private_vault_items")
        .delete()
        .eq("private_space_id", activeSpaceId);
      if (itemsDelErr) {
        // Not fatal if CASCADE is in place; comment out if you rely solely on CASCADE
        console.warn("Items delete warning (maybe CASCADE handled it):", itemsDelErr);
      }

      const { error: spaceErr } = await supabase
        .from("private_spaces")
        .delete()
        .eq("id", activeSpaceId);
      if (spaceErr) throw spaceErr;

      setSuccessMsg(" Private space deleted.");
      return true;
    } catch (err) {
      setErrorMsg(err.message || "Failed to delete private space.");
      return false;
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    errorMsg,
    successMsg,
    handleRenameSpace,
    handleDeleteSpace,
    verifyUserPrivateVaultCode,
  };
};
