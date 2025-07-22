import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useParams } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { decryptFile } from "../../utils/encryption";
import Layout from "../Layout/Layout";
import { X } from "lucide-react";

export default function VaultViewDoc() {
    const navigate = useNavigate();
    
    const { id } = useParams();
    const [vaultCode, setVaultCode] = useState("");
    const [entered, setEntered] = useState(false);
    const [doc, setDoc] = useState(null);
    const [fileUrl, setFileUrl] = useState(null);
    const [fileType, setFileType] = useState("");
    const [errorMsg, setErrorMsg] = useState("");
    const [loading, setLoading] = useState(false);

    // Load vault code from session storage if available
    useEffect(() => {
        const fetchDoc = async () => {
            const { data, error } = await supabase
                .from("vaulted_documents")
                .select("*")
                .eq("id", id)
                .single();

            if (error) {
                setErrorMsg("Failed to load document.");
                console.error("❌ Failed to fetch doc:", error);
            } else {
                setDoc(data);
            }
        };

        fetchDoc();
    }, [id]);

    // Load vault code from session storage if available
    useEffect(() => {
        const fetchAndDecryptFile = async () => {
            if (!doc || !doc.file_urls || !doc.iv || !vaultCode) return;

            try {
                const url = new URL(doc.file_urls); // ✅ fix: define url object from file_urls
                const pathname = url.pathname;
                const bucket = "vaulted";
                const publicPathPrefix = `/storage/v1/object/public/${bucket}/`;
                const filePath = pathname.startsWith(publicPathPrefix)
                ? pathname.slice(publicPathPrefix.length)
                : pathname;

                const { data, error } = await supabase.storage.from(bucket).download(filePath);
                if (error) throw error;

                const encryptedBuffer = await data.arrayBuffer();
                const decryptedBlob = await decryptFile(encryptedBuffer, doc.iv, vaultCode);
                const blobUrl = URL.createObjectURL(decryptedBlob);

                setFileUrl(blobUrl);
                setFileType(decryptedBlob.type || "application/octet-stream");
            } catch (err) {
                setErrorMsg("Decryption failed. Please check your Vault Code.");
                console.error("❌ Decryption error:", err);
            } finally {
                setLoading(false);
            }
        };

        if (entered && doc) {
            setLoading(true);
            fetchAndDecryptFile();
        }
    }, [entered, doc, vaultCode]);

    // Render the file viewer based on the file type
    const renderFileViewer = () => {
        if (!fileUrl || !fileType) return null;

        if (fileType.startsWith("image/")) {
            return <img src={fileUrl} alt={doc.title} className="w-full max-w-3xl rounded shadow" />;
        }

        if (fileType === "application/pdf") {
            return <iframe src={fileUrl} title="PDF Viewer" className="w-full h-[80vh] rounded border" />;
        }

        if (
            fileType.includes("text") ||
            fileType === "application/json" ||
            fileType === "text/csv"
        ) {
            return <iframe src={fileUrl} title="Text Viewer" className="w-full h-[80vh] rounded border" />;
        }

        if (
            fileType.includes("word") ||
            fileType.includes("excel") ||
            fileType.includes("powerpoint")
        ) {
            return (
                <iframe
                    src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`}
                    title="Office Viewer"
                    className="w-full h-[80vh] rounded border"
                />
            );
        }

        if (fileType === "application/zip") {
            return (
                <a href={fileUrl} download={doc.title} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 inline-block">
                    Download ZIP
                </a>
            );
        }

        return (
            <p className="text-sm text-gray-600">
                File type not supported for inline viewing. <a href={fileUrl} download className="text-blue-600 underline">Click to download</a>
            </p>
        );
    };

    return (
        <Layout>
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
                {doc?.notes && <p className="text-s text-gray-700 mb-4">{doc.notes}</p>}

                {!entered ? (
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Enter <strong>Private</strong> Vault Code to Decrypt Document:</label>
                        <input
                            type="password"
                            value={vaultCode}
                            onChange={(e) => {
                                const newCode = e.target.value;
                                setVaultCode(newCode);
                                sessionStorage.setItem("vaultCode", newCode);
                            }}
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
                    renderFileViewer()
                )}
            </div>
        </Layout>
    );
}
