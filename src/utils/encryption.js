const encoder = new TextEncoder();
const decoder = new TextDecoder();

// Function to derive a key from a passphrase using PBKDF2
const getKey = async (passphrase, salt) => {
  const passphraseKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: encoder.encode("vault-salt"),
      iterations: 100000,
      hash: "SHA-256",
    },
    passphraseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
};

// Function to encrypt and decrypt text using AES-GCM
export const encryptText = async (text, passphrase) => {
  const key = await getKey(passphrase);
  const iv = crypto.getRandomValues(new Uint8Array(12));
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

// Function to decrypt text using AES-GCM
export const decryptText = async (encryptedData, ivBase64, passphrase) => {
  const key = await getKey(passphrase);
  const iv = Uint8Array.from(atob(ivBase64), (c) => c.charCodeAt(0));
  const data = Uint8Array.from(atob(encryptedData), (c) => c.charCodeAt(0));
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return { decrypted: decoder.decode(decrypted) };
};

// Function to convert hex string to Uint8Array
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
  const key = await getKey(passphrase, ivBytes);
  const arrayBuffer = await file.arrayBuffer();
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: ivBytes },
    key,
    arrayBuffer
  );

  const encryptedBlob = new Blob([encrypted], { type: file.type });

  const ivHex = Array.from(ivBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return { encryptedBlob, ivHex };
};

// Decrypt a file using AES-GCM with vaultCode-derived key
export async function decryptFile(encryptedBuffer, ivHex, vaultCode) {
  try {
    const iv = hexToUint8Array(ivHex);
    const key = await getKey(vaultCode, iv); // uses same salt as encrypt

    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
      },
      key,
      encryptedBuffer
    );

    return new Blob([decrypted]);
  } catch (err) {
    console.error("❌ Decryption failed:", err);
    throw new Error("Failed to decrypt file");
  }
}
