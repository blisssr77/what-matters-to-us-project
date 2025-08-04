import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import { X, Search } from "lucide-react";
import { encryptText } from "../../../lib/encryption";
import Layout from "../../Layout/Layout";
import { file } from "jszip";
import bcrypt from "bcryptjs"; 
import { useWorkspaceStore } from "../../../store/useWorkspaceStore";
import { UnsavedChangesModal } from "../../common/UnsavedChangesModal";

const WorkspaceUploadNote = () => {
    const [title, setTitle] = useState("");
    const [privateNote, setPrivateNote] = useState("");
    const [loading, setLoading] = useState(false);
    const [newTag, setNewTag] = useState("");
    const [tags, setTags] = useState([]);
    const [notes, setNotes] = useState("");
    const [availableTags, setAvailableTags] = useState([]);
    const [successMsg, setSuccessMsg] = useState("");
    const [errorMsg, setErrorMsg] = useState("");
    const [vaultCode, setVaultCode] = useState("");
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [showUnsavedPopup, setShowUnsavedPopup] = useState(false);
    const [isVaulted, setIsVaulted] = useState(true);

    const { activeWorkspaceId, setActiveWorkspaceId } = useWorkspaceStore();
    const navigate = useNavigate();

    // ✅ Fetch and set active workspace on mount
    useEffect(() => {
        const fetchWorkspace = async () => {
        const { data: userData } = await supabase.auth.getUser();
        const authUserId = userData?.user?.id;

        if (!authUserId) {
            console.error("No authenticated user found");
            return;
        }

        const { data, error } = await supabase
            .from("workspace_members")
            .select("workspace_id")
            .eq("user_id", authUserId)
            .maybeSingle();

        if (data?.workspace_id) {
            setActiveWorkspaceId(data.workspace_id);
            console.log("Active Workspace ID:", data.workspace_id);
        } else {
            console.warn("⚠️ No workspace found for user.");
        }
        };

        fetchWorkspace();
    }, [setActiveWorkspaceId]);

     // Message timeout for success/error
    useEffect(() => {
        if (successMsg || errorMsg) {
            const timer = setTimeout(() => {
                setSuccessMsg("");
                setErrorMsg("");
            }, 4000);
            return () => clearTimeout(timer);
        }
    }, [successMsg, errorMsg]);

    // ✅ Fetch tags for this workspace
    useEffect(() => {
        if (!activeWorkspaceId) return;
        const fetchTags = async () => {
        const { data, error } = await supabase
            .from("vault_tags")
            .select("*")
            .eq("workspace_id", activeWorkspaceId);
        if (!error) setAvailableTags(data.map((tag) => tag.name));
        };
        fetchTags();
    }, [activeWorkspaceId]);

    // ✅ Handle tag addition
    const handleTagAdd = async () => {
        if (!newTag.trim()) return;

        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user?.id) {
        console.error("Unable to get user.");
        return;
        }

        if (!availableTags.includes(newTag)) {
        await supabase.from("vault_tags").insert({
            name: newTag,
            section: "Workspace",
            user_id: user.id,
            workspace_id: activeWorkspaceId,
        });
        setAvailableTags((prev) => [...prev, newTag]);
        }

        if (!tags.includes(newTag)) setTags((prev) => [...prev, newTag]);
        setNewTag("");
    };

    // ✅ Handle note upload
    const handleCreate = async () => {
        setLoading(true);
        setSuccessMsg("");
        setErrorMsg("");

        // Authenticate user
        const { data: userData } = await supabase.auth.getUser();
        const user = userData?.user;

        // Check if user is authenticated
        if (!user?.id) {
            setLoading(false);
            setErrorMsg("User not authenticated.");
            return;
        }

        // Check Vault Code if needed
        if (isVaulted) {
            if (!vaultCode) {
                setLoading(false);
                setErrorMsg("Please enter your Vault Code.");
                return;
            }

            const { data: vaultCodeRow, error: vaultError } = await supabase
                .from("vault_codes")
                .select("private_code")
                .eq("id", user.id)
                .single();

            if (vaultError || !vaultCodeRow?.private_code) {
                setLoading(false);
                setErrorMsg(
                    'Please set your Vault Code in <a href="/account/manage" class="text-blue-600 underline">Account Settings</a> before uploading.'
                );
                return;
            }

            const isMatch = await bcrypt.compare(vaultCode, vaultCodeRow.private_code);
            if (!isMatch) {
                setLoading(false);
                setErrorMsg("Incorrect Vault Code.");
                return;
            }
        }

        // Encrypt note and insert to DB
        try {
            const { encryptedData, iv } = await encryptText(privateNote, vaultCode);
            const { error } = await supabase.from("workspace_vault_items").insert({
                user_id: user.id,
                file_name: title || "Untitled Note",
                title,
                notes,
                encrypted_note: encryptedData,
                note_iv: iv,
                tags,
                workspace_id: activeWorkspaceId,
                created_by: user.id,
                is_vaulted: isVaulted,
        });

        if (error) {
            console.error(error);
            setErrorMsg("Failed to create note.");
        } else {
            setSuccessMsg("✅ Note created successfully!");
            setTimeout(() => navigate("/workspace/vaults"), 1300);
        }
        } catch (err) {
            console.error("Encryption failed:", err);
            setErrorMsg("Encryption error.");
        } finally {
            setLoading(false);
            setHasUnsavedChanges(false);
        }
    };

    return (
        <Layout>
            {/* Unsaved changes confirmation popup */}
            <UnsavedChangesModal
                show={showUnsavedPopup}
                onCancel={() => setShowUnsavedPopup(false)}
                redirectPath="/workspace/vaults"
                message="You have unsaved changes. Are you sure you want to leave?"
            />

            <div className="relative max-w-xl mx-auto mt-10 p-6 bg-white rounded shadow border border-gray-200">
                <button
                    onClick={() => {
                        if (hasUnsavedChanges) {
                        setShowUnsavedPopup(true);
                        } else {
                        navigate("/workspace/vaults");
                        }
                    }}
                    className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
                    >
                    <X size={20} />
                </button>

                <h2 className="text-xl font-bold mb-4 text-gray-800">📝 Upload to Workspace Vault</h2>

                <label className="block text-sm font-medium mb-1 text-gray-700">Note title:</label>
                <input
                    value={title}
                    onChange={(e) => {
                        setTitle(e.target.value);
                        setHasUnsavedChanges(true);
                    }}
                    className="w-full p-2 mb-4 border rounded text-gray-700 text-sm bg-gray-50"
                    placeholder="Enter note title (Public)"
                />

                {/* Notes */}
                <div>
                    <h className="text-sm font-medium mb-1 text-gray-800">Public note:</h>
                    <textarea
                        value={notes}
                        onChange={(e) => {
                            setNotes(e.target.value);
                            setHasUnsavedChanges(true);
                        }}
                        placeholder="Public notes (Visible to shared contacts)"
                        rows={2}
                        className="w-full border bg-gray-50 border-gray-300 p-2 rounded text-gray-800 placeholder-gray-400 text-sm"
                    />
                </div>

                {/* Tag Section */}
                <div className="mb-4">
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Add tags:</label>

                    <div className="relative flex items-center gap-2 mb-2">
                    <Search className="absolute left-3 text-gray-400" size={16} />
                    <input
                        type="text"
                        value={newTag}
                        onChange={(e) => {
                            setNewTag(e.target.value);
                            setHasUnsavedChanges(true);
                        }}
                        placeholder="Search existing tags or create new"
                        className="w-full pl-8 border border-gray-300 p-2 rounded text-gray-800 placeholder-gray-400 text-sm"
                    />
                    <button
                        type="button"
                        onClick={handleTagAdd}
                        className="btn-secondary text-sm"
                    >
                        Create
                    </button>
                    </div>

                    <div className="max-h-40 overflow-y-auto border border-gray-200 rounded p-2 bg-gray-50">
                    {availableTags
                        .filter((tag) => tag.toLowerCase().includes(newTag.toLowerCase()) && !tags.includes(tag))
                        .map((tag) => (
                        <div key={tag} className="flex items-center gap-2 py-1">
                            <input
                            type="checkbox"
                            checked={tags.includes(tag)}
                            onChange={() => {
                                setHasUnsavedChanges(true);
                                setTags((prev) =>
                                prev.includes(tag)
                                    ? prev.filter((t) => t !== tag)
                                    : [...prev, tag]
                                )
                            }}
                            />
                            <span className="text-xs text-gray-700">{tag}</span>
                        </div>
                        ))}
                    </div>

                    {tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                        {tags.map((tag) => (
                        <span
                            key={tag}
                            className="bg-yellow-50 text-gray-800 text-xs px-3 py-1 rounded-full flex items-center gap-1"
                        >
                            {tag}
                            <X
                            size={12}
                            className="cursor-pointer"
                            onClick={() => setTags(tags.filter((t) => t !== tag))}
                            />
                        </span>
                        ))}
                    </div>
                    )}
                </div>

                {/* Privacy Section */}
                <div className="mb-4">
                    <label className="mr-4 font-semibold text-gray-800 text-sm">Upload Type:</label>
                    <label className="mr-4 text-gray-800 text-sm">
                        <input
                        type="radio"
                        name="privacy"
                        value="vaulted"
                        checked={isVaulted}
                        onChange={() => setIsVaulted(true)}
                        />
                        Vaulted (Encrypted)
                    </label>
                    <label className="text-gray-800 text-sm">
                        <input
                        type="radio"
                        name="privacy"
                        value="public"
                        checked={!isVaulted}
                        onChange={() => setIsVaulted(false)}
                        />
                        Public
                    </label>
                </div>

                {isVaulted && (
                    <>
                    {/* Private Note Section */}
                    <p className="text-sm text-red-400 mb-1">
                        🔐 <strong>Private note</strong> will be encrypted using your saved Vault Code:
                    </p>
                    <textarea
                        value={privateNote}
                        onChange={(e) => {
                            setPrivateNote(e.target.value);
                            setHasUnsavedChanges(true);
                        }}
                        rows="6"
                        className="w-full p-2 border bg-gray-50 rounded mb-3 text-gray-700 text-sm"
                        placeholder="Write your note here.."
                    />
                    {/* Vault Code Section */}
                    <label className="block text-sm font-medium mb-1 text-gray-700">
                        Enter <strong>Private</strong> vault code to encrypt note:
                    </label>
                    <input
                        type="password"
                        value={vaultCode}
                        onChange={(e) => setVaultCode(e.target.value)}
                        className="w-full p-2 border rounded mb-3 text-gray-600 text-sm bg-gray-50"
                        placeholder="Vault code"
                    />
                    </>
                )}

                <button
                    onClick={handleCreate}
                    disabled={loading}
                    className="btn-secondary w-full mt-4"
                >
                    {loading ? "Creating..." : "Upload Note"}
                </button>

                <br />
                {successMsg && (
                    <p className="text-sm text-center mt-3 text-green-600">{successMsg}</p>
                )}
                {errorMsg && (
                    <p className="text-sm text-center mt-3 text-red-600">{errorMsg}</p>
                )}
            </div>
        </Layout>
    );
};

export default WorkspaceUploadNote;
