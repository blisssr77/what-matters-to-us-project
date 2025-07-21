import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { decryptFile } from "../../utils/decryptFile";
import Layout from "../Layout/Layout";
import JSZip from "jszip";

export default function VaultViewDoc() {
    const { id } = useParams();
    const [fileUrl, setFileUrl] = useState(null);
    const [fileName, setFileName] = useState("");
    const [fileType, setFileType] = useState("");
    const [vaultCode, setVaultCode] = useState(sessionStorage.getItem("vaultCode") || "");
    const [errorMsg, setErrorMsg] = useState("");
    const [loading, setLoading] = useState(true);
    const [doc, setDoc] = useState(null);

    // Set up file URL and type based on the document
    useEffect(() => {
        const fetchDoc = async () => {
            const { data, error } = await supabase
            .from("vaulted_documents")
            .select("*")
            .eq("id", id) // assuming `id` is from URL
            .single();

            if (error) {
            console.error("❌ Failed to fetch doc:", error);
            } else {
            console.log("📄 Document loaded:", data);
            setDoc(data);
            }
        };

        fetchDoc();
    }, [id]);

    // Decrypt the file and set the URL
    useEffect(() => {
        const fetchAndDecryptFile = async () => {
            if (!doc || !doc.file_urls || !doc.iv) {
            console.warn("📛 Missing file_urls or iv in doc:", doc);
            return;
            }

            try {
            const [bucket, ...pathParts] = doc.file_urls.split("/");
            const filePath = pathParts.join("/");

            const { data, error } = await supabase.storage.from(bucket).download(filePath);
            if (error) throw error;

            const encryptedBuffer = await data.arrayBuffer();
            const decryptedBlob = await decryptFile(encryptedBuffer, doc.iv);
            const blobUrl = URL.createObjectURL(decryptedBlob);
            setDecryptedUrl(blobUrl);
            } catch (err) {
            console.error("Decryption error:", err);
            }
        };

        if (doc) fetchAndDecryptFile();
        console.log("🔍 Fetching document with Doc:", doc);
    }, [doc]);

    // Set file URL, name, and type after decryption
    const renderFileViewer = () => {
        if (!fileUrl || !fileType) return null;

        if (fileType.startsWith("image/")) {
            return <img src={fileUrl} alt={fileName} className="w-full max-w-3xl rounded shadow" />;
        }

        if (fileType === "application/pdf") {
            return (
                <iframe
                    src={fileUrl}
                    title="PDF Viewer"
                    className="w-full h-[80vh] rounded border"
                />
            );
        }

        if (
            fileType.includes("text") ||
            fileType === "application/json" ||
            fileType === "text/csv"
        ) {
            return (
                <iframe
                    src={fileUrl}
                    title="Text Viewer"
                    className="w-full h-[80vh] rounded border"
                />
            );
        }

        if (
            fileType.includes("word") ||
            fileType.includes("excel") ||
            fileType.includes("powerpoint")
        ) {
            return (
                <iframe
                    src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(
                        fileUrl
                    )}`}
                    title="Office Viewer"
                    className="w-full h-[80vh] rounded border"
                />
            );
        }

        if (fileType === "application/zip") {
            return (
                <a
                    href={fileUrl}
                    download={fileName}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 inline-block"
                >
                    Download ZIP
                </a>
            );
        }

        return (
            <p className="text-sm text-gray-600">
                File type not supported for inline viewing.{" "}
                <a href={fileUrl} download className="text-blue-600 underline">
                    Click to download
                </a>
            </p>
        );
    };

    return (
        <Layout>
            <div className="max-w-4xl mx-auto p-6 mt-10 bg-white rounded shadow border border-gray-200">
                <h2 className="text-xl font-bold text-gray-800 mb-4">📂 View Document</h2>
                {loading && <p className="text-sm text-gray-500">Decrypting document...</p>}
                {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}
                {!loading && !errorMsg && renderFileViewer()}
            </div>
        </Layout>
    );
}
