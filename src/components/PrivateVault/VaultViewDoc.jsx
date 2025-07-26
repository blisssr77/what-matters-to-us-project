import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { decryptFile, decryptText } from "../../utils/encryption";
import Layout from "../Layout/Layout";
import { X, Copy, Edit2, Trash2 } from "lucide-react";
import { saveAs } from "file-saver";

const mimeToExtension = {
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.ms-powerpoint": ".ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
  "text/plain": ".txt",
  "text/csv": ".csv",
  "image/jpeg": ".jpg",
  "image/png": ".png",
};

export default function VaultViewDoc() {
  const navigate = useNavigate();
  const { id } = useParams();

  const [vaultCode, setVaultCode] = useState("");
  const [entered, setEntered] = useState(false);
  const [doc, setDoc] = useState(null);
  const [decryptedFileUrl, setDecryptedFileUrl] = useState(null);
  const [decryptedFileType, setDecryptedFileType] = useState("");
  const [decryptedBlob, setDecryptedBlob] = useState(null);
  const [decryptedNote, setDecryptedNote] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showConfirmPopup, setShowConfirmPopup] = useState(false);
  
  // Fetch document data on mount
  useEffect(() => {
    const fetchDoc = async () => {
    const { data, error } = await supabase.from("vault_items").select("*").eq("id", id).single();
    if (error) {
        setErrorMsg("Failed to load document.");
        console.error("❌ Failed to fetch doc:", error);
    } else {
        setDoc(data);
    }
    };
    fetchDoc();
  }, [id]);

  // Handle vault code entry
  useEffect(() => {
    const decrypt = async () => {
        if (!doc || !vaultCode) return;
        setLoading(true);

        // 1. Fetch vault code hash
        if (!doc.note_iv || !doc.encrypted_note) {
            setErrorMsg("❌ Nothing to decrypt for this document.");
            setLoading(false);
            return;
        }

        try {
        // ✅ Decrypt note using stored Base64 IV
        if (doc.encrypted_note && doc.note_iv) {
            try {
            const note = await decryptText(doc.encrypted_note, doc.note_iv, vaultCode);
            setDecryptedNote(note);
            console.log("✅ Decrypted note:", note);
            } catch (err) {
            console.error("❌ Note decryption failed:", err);
            }
        }

        // ✅ Decrypt file
        if (doc.file_metas?.length) {
            const fileMeta = doc.file_metas[0];
            const { url, iv } = fileMeta;
            const urlObj = new URL(url);
            const pathname = urlObj.pathname;
            const bucket = "vaulted";
            const publicPathPrefix = `/storage/v1/object/public/${bucket}/`;
            const filePath = pathname.startsWith(publicPathPrefix)
            ? pathname.slice(publicPathPrefix.length)
            : pathname;

            const { data, error } = await supabase.storage.from(bucket).download(filePath);
            if (error) throw error;

            const encryptedBuffer = await data.arrayBuffer();
            const blob = await decryptFile(encryptedBuffer, iv, vaultCode);
            const blobUrl = URL.createObjectURL(blob);

            setDecryptedBlob(blob);
            setDecryptedFileUrl(blobUrl);
            setDecryptedFileType(blob.type || "application/octet-stream");
        }
        } catch (err) {
        console.error("❌ Decryption error:", err);
        setErrorMsg("Decryption failed. Please check your Vault Code.");
        } finally {
        setLoading(false);
        }
    };

    if (entered && doc) {
        decrypt();
    }
  }, [entered, doc, vaultCode]);

  // Handle delete confirmation
  const handleDeleteDoc = async () => {
    setShowDeleteConfirm(false);

    if (!doc) return;

    // Delete from storage if files exist
    if (doc.file_metas && doc.file_metas.length > 0) {
      const paths = doc.file_metas.map((meta) => {
        const urlParts = meta.url.split("/");
        return decodeURIComponent(urlParts.slice(4).join("/"));
      });

      const { error: storageError } = await supabase.storage
        .from("vaulted")
        .remove(paths);

      if (storageError) {
        console.error("❌ Error deleting from storage:", storageError);
      }
    }

    // Delete from DB
    const { error: dbError } = await supabase
      .from("vault_items")
      .delete()
      .eq("id", doc.id);

    if (dbError) {
      console.error("❌ Error deleting from DB:", dbError);
    } else {
      navigate("/private/vaults");
    }
  };

  // Handle copy to clipboard
  const handleCopy = async () => {
    if (decryptedNote) {
      await navigator.clipboard.writeText(decryptedNote);
    }
  };

  // Render file viewer based on type
  const renderFileViewer = () => {
    if (!decryptedFileUrl || !decryptedFileType) return null;

    if (decryptedFileType.startsWith("image/")) {
      return <img src={decryptedFileUrl} alt={doc.title} className="w-full max-w-3xl rounded shadow" />;
    }

    if (decryptedFileType === "application/pdf") {
      return <iframe src={decryptedFileUrl} title="PDF Viewer" className="w-full h-[80vh] rounded border" />;
    }

    if (["application/json", "text/csv"].includes(decryptedFileType) || decryptedFileType.includes("text")) {
      return <iframe src={decryptedFileUrl} title="Text Viewer" className="w-full h-[80vh] rounded border" />;
    }

    if (decryptedFileType.includes("word") || decryptedFileType.includes("excel") || decryptedFileType.includes("powerpoint")) {
      return (
        <iframe
          src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(decryptedFileUrl)}`}
          title="Office Viewer"
          className="w-full h-[80vh] rounded border"
        />
      );
    }

    console.log("Decrypted file type:", decryptedFileType);
    return <p className="text-sm text-gray-600">File type not supported for inline viewing.</p>;
  };

  return (
    <Layout>
      {/* Delete confirmation modal */}
      {showConfirmPopup && (
        <div className="fixed top-6 right-6 bg-gray-500/20 opacity-90 backdrop-blur-md shadow-md rounded-lg p-4 z-50 text-sm">
          <p className="mt-10 text-gray-800">
            Are you sure you want to delete <strong>{doc?.title || "this document"}</strong>?
          </p>
          <div className="flex gap-3 justify-end mt-4">
            <button
              onClick={async () => {
                await handleDeleteDoc();
                setShowConfirmPopup(false);
              }}
              className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
            >
              Yes, Delete
            </button>
            <button
              onClick={() => setShowConfirmPopup(false)}
              className="px-3 py-1 bg-gray-300 text-gray-800 rounded hover:bg-gray-400"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="relative max-w-4xl mx-auto p-6 mt-10 bg-white rounded shadow border border-gray-200">
        <button
          onClick={() => navigate("/private/vaults")}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-2xl"
          aria-label="Close"
        >
          <X size={20} />
        </button>

        <h2 className="text-xl font-bold text-gray-800 mb-2">📂 View Document</h2>
        {doc?.title && <h3 className="text-lg text-gray-800 font-semibold mb-1">{doc.title}</h3>}
        {doc?.notes && <p className="text-sm text-gray-700 mb-2">{doc.notes}</p>}
        {entered && decryptedNote && (
          <div className="text-sm text-purple-900 bg-purple-50 border border-purple-200 rounded p-3 mb-4">
            {decryptedNote}
          </div>
        )}
        {doc?.file_name && <p className="text-sm text-blue-700 mb-2">{doc.file_name}</p>}

        {/* Vault code entry */}
        {!entered ? (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Enter <strong>Vault Code</strong> to Decrypt Document:
            </label>
            <input
              type="password"
              value={vaultCode}
              onChange={(e) => setVaultCode(e.target.value)}
              className="border border-gray-300 rounded px-3 py-2 w-full text-gray-600"
              placeholder="Vault Code"
            />
            <button
              onClick={() => setEntered(true)}
              className="mt-2 px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
            >
              Decrypt
            </button>
          </div>
        ) : loading ? (
          <p className="text-sm text-gray-500">🔐 Decrypting document...</p>
        ) : errorMsg ? (
          <p className="text-sm text-red-600">{errorMsg}</p>
        ) : (
          <>
            {/* Action buttons */}
            <div className="flex gap-4 text-sm mb-4">
            <button onClick={handleCopy} className="flex items-center gap-1 text-purple-600 hover:underline">
                <Copy size={16} /> Copy
            </button>
            <button onClick={() => navigate(`/private/vaults/doc-edit/${id}`)} className="flex items-center gap-1 text-blue-600 hover:underline">
                <Edit2 size={16} /> Edit
            </button>
            <button onClick={() => setShowConfirmPopup(true)} className="flex items-center gap-1 text-red-600 hover:underline">
                <Trash2 size={16} /> Delete
            </button>
            </div>

            {/* Delete confirmation modal
            {showDeleteConfirm && (
                <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
                    <div className="bg-white p-6 rounded-lg shadow-lg max-w-sm w-full">
                        <h4 className="text-lg font-semibold mb-2 text-gray-800">Delete Note?</h4>
                        <p className="text-sm text-gray-600 mb-4">
                            This action cannot be undone. Are you sure you want to delete this note?
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowDeleteConfirm(false)}
                                className="px-3 py-1 text-gray-700 border border-gray-300 rounded hover:bg-gray-100"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDelete}
                                className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )} */}

            {/* File viewer */}
            {renderFileViewer()}
            {decryptedBlob && (
              <button
                onClick={() => {
                  const extension = mimeToExtension[decryptedFileType] || "";
                  const fallbackName = doc?.title?.replace(/\s+/g, "_").toLowerCase() || "document";
                  const filename = fallbackName + extension;
                  saveAs(decryptedBlob, filename);
                }}
                className="mt-4 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              >
                ⬇️ Download File
              </button>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
