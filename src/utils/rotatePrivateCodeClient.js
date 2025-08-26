import { supabase } from "@/lib/supabaseClient";
import { decryptText, encryptText, decryptFile, encryptFile } from "@/lib/encryption";

/*
 * Rotate ALL of the current user's Private-space vaulted content
 * from oldCode -> newCode across every private space they own.
 */
export async function rotatePrivateCodeClient(oldCode, newCode, onProgress) {
  // A) verify old private code first (user-level)
  const { data: ok, error: vErr } = await supabase.rpc("verify_user_private_code", {
    p_code: oldCode.trim(),
  });
  if (vErr) throw new Error(vErr.message || "Verify failed");
  if (!ok) throw new Error("Current (old) private code is incorrect.");

  // B) find user + their private spaces
  const { data: { user } = {} } = await supabase.auth.getUser();
  if (!user?.id) throw new Error("Not signed in.");

  const { data: spaces, error: sErr } = await supabase
    .from("private_spaces")
    .select("id")
    .eq("created_by", user.id);
  if (sErr) throw sErr;

  const spaceIds = (spaces || []).map(s => s.id);
  if (!spaceIds.length) return true; // nothing to rotate

  // C) fetch all vaulted items across these spaces
  const { data: items, error: iErr } = await supabase
    .from("private_vault_items")
    .select("*")
    .in("private_space_id", spaceIds)
    .eq("is_vaulted", true);
  if (iErr) throw iErr;

  let done = 0;
  const tick = (extra) => onProgress?.(++done, items?.length ?? 0, extra);

  for (const it of items || []) {
    // 1) rotate note (if present)
    let newEncryptedNote = it.encrypted_note ?? null;
    let newNoteIv = it.note_iv ?? null;

    if (it.encrypted_note && it.note_iv) {
      try {
        const plaintext = await decryptText(it.encrypted_note, it.note_iv, oldCode);
        const { encryptedData, iv } = await encryptText(plaintext, newCode);
        newEncryptedNote = encryptedData;
        newNoteIv = iv;
      } catch (e) {
        console.warn("Private note rotate failed", it.id, e);
        // continue with files
      }
    }

    // 2) rotate files in private.vaulted
    const metas = Array.isArray(it.file_metas) ? [...it.file_metas] : [];
    for (let i = 0; i < metas.length; i++) {
      const fm = metas[i];
      const bucket = "private.vaulted";
      const path = fm?.path;    // vaulted files should store 'path'
      const iv = fm?.iv;
      if (!path || !iv) continue;

      try {
        const { data: dl, error: dlErr } = await supabase.storage.from(bucket).download(path);
        if (dlErr) throw dlErr;

        const encBuf = await dl.arrayBuffer();
        const mime = fm.type || "application/octet-stream";
        const blob = await decryptFile(encBuf, iv, oldCode, mime);

        const { encryptedBlob, ivHex } = await encryptFile(blob, newCode);
        const { error: upErr } = await supabase.storage
          .from(bucket)
          .upload(path, encryptedBlob, { contentType: mime, upsert: true });
        if (upErr) throw upErr;

        metas[i] = { ...fm, iv: ivHex };
      } catch (e) {
        console.warn("Private file rotate failed", { id: it.id, path }, e);
        // decide if you want to stop; continuing keeps other items rotating
      }
    }

    // 3) persist rotated metadata
    const { error: upErr } = await supabase
      .from("private_vault_items")
      .update({
        encrypted_note: newEncryptedNote,
        note_iv: newNoteIv,
        file_metas: metas,
        updated_at: new Date().toISOString(),
      })
      .eq("id", it.id);
    if (upErr) throw upErr;

    tick({ itemId: it.id });
  }

  return true;
}
