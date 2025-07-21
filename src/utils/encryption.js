const encoder = new TextEncoder();
const decoder = new TextDecoder();

// Function to derive a key from a passphrase using PBKDF2
const getKey = async (passphrase) => {
  const passphraseKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  // Derive a key using PBKDF2 with SHA-256
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
