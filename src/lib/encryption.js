const encoder = new TextEncoder();
const decoder = new TextDecoder();

// Derives an AES-GCM key using PBKDF2
const getKey = async (passphrase, salt = "vault-salt") => {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: typeof salt === "string" ? encoder.encode(salt) : salt, // handle string or Uint8Array
      iterations: 100000,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
};

// Text Encryption
export const encryptText = async (text, passphrase) => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await getKey(passphrase, "vault-salt");
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(text)
  );

  return {
    encryptedData: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    iv: btoa(String.fromCharCode(...iv)),
  };
};

// Text Decryption
export const decryptText = async (encryptedData, ivBase64, passphrase) => {
  const key = await getKey(passphrase);
  const iv = Uint8Array.from(atob(ivBase64), (c) => c.charCodeAt(0));
  const data = Uint8Array.from(atob(encryptedData), (c) => c.charCodeAt(0));
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return decoder.decode(decrypted); // ✅ returns a string directly
};

// Converts hex IV string to Uint8Array
function hexToUint8Array(hex) {
  return new Uint8Array(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
}

// File Encryption
export const encryptFile = async (file, passphrase, ivBytes) => {
  const key = await getKey(passphrase, ivBytes);
  const arrayBuffer = await file.arrayBuffer();
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: ivBytes },
    key,
    arrayBuffer
  );

  const encryptedBlob = new Blob([encrypted], { type: file.type });
  const ivHex = Array.from(ivBytes).map((b) => b.toString(16).padStart(2, "0")).join("");

  return { encryptedBlob, ivHex, mimeType: file.type };
};

// File Decryption
export async function decryptFile(encryptedBuffer, ivHex, passphrase, mimeType = "") {
  try {
    const iv = hexToUint8Array(ivHex);
    const key = await getKey(passphrase, iv);

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      encryptedBuffer
    );

    return new Blob([decrypted], { type: mimeType || "application/octet-stream" });
  } catch (err) {
    console.error("❌ Decryption failed:", err);
    throw new Error("Failed to decrypt file");
  }
}