export async function decryptFile(encryptedBuffer, iv, vaultCode) {
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
        "raw",
        enc.encode(vaultCode),
        { name: "PBKDF2" },
        false,
        ["deriveKey"]
    );

    const key = await window.crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: enc.encode("vault-doc-salt"), // consistent salt
            iterations: 100000,
            hash: "SHA-256",
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"]
    );

    try {
        const decryptedBuffer = await window.crypto.subtle.decrypt(
            {
                name: "AES-GCM",
                iv: Uint8Array.from(atob(iv), (c) => c.charCodeAt(0)),
            },
            key,
            encryptedBuffer
        );
        return new Blob([decryptedBuffer]);
    } catch (error) {
        console.error("Decryption failed:", error);
        throw new Error("Failed to decrypt file");
    }
}
