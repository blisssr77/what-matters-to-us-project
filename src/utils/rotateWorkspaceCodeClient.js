import { supabase } from "@/lib/supabaseClient";
import { decryptText, encryptText, decryptFile, encryptFile } from "@/lib/encryption";

export async function rotateWorkspaceCodeClient(workspaceId, oldCode, newCode, onProgress) {
  // 0) verify permission + old code is correct
  const { data: ok, error: vErr } = await supabase.rpc("verify_workspace_code", {
    p_workspace: workspaceId,
    p_code: oldCode.trim(),
  });
  if (vErr) throw new Error(vErr.message || "Verify failed");
  if (!ok) throw new Error("Current (old) code is incorrect.");

  // 1) fetch vaulted items
  const { data: items, error } = await supabase
    .from("workspace_vault_items")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("is_vaulted", true);

  if (error) throw error;

  let done = 0;
  const tick = (extra) => onProgress?.(++done, items.length, extra);

  for (const it of items || []) {
    // 2) rotate encrypted_note (if present)
    let newEncryptedNote = it.encrypted_note || null;
    let newNoteIv = it.note_iv || null;

    if (it.encrypted_note && it.note_iv) {
      try {
        const plaintext = await decryptText(it.encrypted_note, it.note_iv, oldCode);
        const { encryptedData, iv } = await encryptText(plaintext, newCode);
        newEncryptedNote = encryptedData;
        newNoteIv = iv;
      } catch (e) {
        console.warn("Note rotate failed for item", it.id, e);
        // continue with files; you might prefer to throw instead
      }
    }

    // 3) rotate files (if any)
    const metas = Array.isArray(it.file_metas) ? [...it.file_metas] : [];
    for (let i = 0; i < metas.length; i++) {
      const fm = metas[i];
      // only vaulted files live in workspace.vaulted
      const bucket = "workspace.vaulted";
      const path = fm.path; // you store this today
      if (!path || !fm.iv) continue;

      try {
        const { data: dl, error: dlErr } = await supabase.storage.from(bucket).download(path);
        if (dlErr) throw dlErr;

        const encBuf = await dl.arrayBuffer();
        const decryptedBlob = await decryptFile(encBuf, fm.iv, oldCode, fm.type);

        // re-encrypt with new code + fresh IV
        const { encryptedBlob, ivHex } = await encryptFile(decryptedBlob, newCode);
        const { error: upErr } = await supabase.storage
          .from(bucket)
          .upload(path, encryptedBlob, { contentType: fm.type, upsert: true });
        if (upErr) throw upErr;

        metas[i] = { ...fm, iv: ivHex }; // update iv in metadata
      } catch (e) {
        console.warn("File rotate failed", { id: it.id, path }, e);
        // decide if you want to stop or continue
      }
    }

    // 4) persist the rotated metadata for this item
    const { error: upItemErr } = await supabase
      .from("workspace_vault_items")
      .update({
        encrypted_note: newEncryptedNote,
        note_iv: newNoteIv,
        file_metas: metas,
        updated_at: new Date().toISOString(),
      })
      .eq("id", it.id)
      .eq("workspace_id", workspaceId);

    if (upItemErr) throw upItemErr;

    tick({ itemId: it.id });
  }

  return true;
}
