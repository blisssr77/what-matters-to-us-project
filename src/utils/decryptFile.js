function hexToUint8Array(hex) {
  if (!hex || typeof hex !== "string") return new Uint8Array();
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

// Encrypt a File (or Blob) using AES-GCM with vaultCode-derived key
export const encryptFile = async (file, passphrase, ivBytes) => {
  const key = await getKey(passphrase);

  const arrayBuffer = await file.arrayBuffer();
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: ivBytes },
    key,
    arrayBuffer
  );

  const encryptedBlob = new Blob([encrypted], { type: file.type });

  // Convert IV to base64 or hex to store in DB
  const ivHex = Array.from(ivBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return { encryptedBlob, ivHex };
};

export async function decryptFile(encryptedBuffer, ivHex, vaultCode) {
  try {
    const iv = hexToUint8Array(ivHex); // Convert IV from hex to Uint8Array
    const enc = new TextEncoder();

    // Generate key material
    const keyMaterial = await window.crypto.subtle.importKey(
      "raw",
      enc.encode(vaultCode),
      "PBKDF2",
      false,
      ["deriveKey"]
    );

    // Derive AES-GCM key using PBKDF2
    const key = await window.crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: iv,
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );

    // Decrypt the data
    const decrypted = await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv,
      },
      key,
      encryptedBuffer
    );

    return new Blob([decrypted]); // Return Blob for viewing or download
  } catch (err) {
    console.error("❌ Decryption failed:", err);
    throw new Error("Failed to decrypt file");
  }
}