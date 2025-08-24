import { useEffect, useState, useMemo } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import { X, Search } from "lucide-react";
import { encryptText } from "../../../lib/encryption";
import Layout from "../../Layout/Layout";
import bcrypt from "bcryptjs"; 
import { useWorkspaceStore } from "../../../hooks/useWorkspaceStore";
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
    const [wsName, setWsName] = useState("");
    const navigate = useNavigate();

    // ✅ Fetch and set active workspace on mount
    // 1) On mount, pick an active workspace ID for this user
    useEffect(() => {
        (async () => {
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData?.user?.id;
        if (!userId) return;

        const { data: membership } = await supabase
            .from("workspace_members")
            .select("workspace_id")
            .eq("user_id", userId)
            .maybeSingle();

        if (membership?.workspace_id) {
            setActiveWorkspaceId(membership.workspace_id);
            console.log("Active Workspace ID:", membership.workspace_id);
        } else {
            console.warn("⚠️ No workspace found for user.");
        }
        })();
    }, [setActiveWorkspaceId]);

    // 2) Whenever the active ID changes, fetch its name
    useEffect(() => {
        if (!activeWorkspaceId) {
        setWsName("");
        return;
        }
        (async () => {
        const { data, error } = await supabase
            .from("workspaces")
            .select("name")
            .eq("id", activeWorkspaceId)
            .single();

        setWsName(error ? "" : data?.name ?? "");
        })();
    }, [activeWorkspaceId]);

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

    // Ensure selected tags are visible even if legacy/user-only
    const tagOptions = useMemo(
        () => Array.from(new Set([...(availableTags || []), ...(tags || [])])),
        [availableTags, tags]
    );

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

        // Check Vault Code if needed (Model A: per-user workspace code)
        if (isVaulted) {
            const code = (vaultCode || "").trim();
            if (!code) {
                setLoading(false);
                setErrorMsg("Please enter your Vault Code.");
                return;
            }

            const { data: ok, error } = await supabase.rpc("verify_workspace_code", {
                p_workspace: activeWorkspaceId,
                p_code: code,
            });

            if (error) {
                setLoading(false);
                setErrorMsg(error.message || "Verification failed.");
                return;
            }
            if (!ok) {
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

                <h2 className="text-xl font-bold mb-4 text-gray-800">📝 Upload to {wsName}</h2>

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

                {/* Tag Input Section */}
                <div className="mb-4">
                    <label className="block text-sm mb-1 text-gray-800">Tags:</label>
                    <div className="flex gap-2">
                    <input
                        value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                        className="border rounded px-2 py-1 text-sm flex-1 text-gray-700"
                        placeholder="Add a tag"
                    />
                    <button onClick={handleTagAdd} className="btn-secondary">Add</button>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                    {tagOptions.map((t) => {
                        const selected = tags.includes(t);
                        return (
                        <button
                            key={t}
                            type="button"
                            onClick={() =>
                            setTags((prev) =>
                                selected ? prev.filter((x) => x !== t) : [...prev, t]
                            )
                            }
                            className={`px-2 py-1 rounded text-xs border ${
                            selected
                                ? "bg-purple-100 border-purple-400 text-purple-700"
                                : "bg-white border-gray-300 text-gray-700"
                            }`}
                        >
                            {t}
                        </button>
                        );
                    })}
                    </div>
                </div>

                {isVaulted && (
                    <>
                    {/* Private Note Section */}
                    <p className="text-sm text-red-400 mb-1">
                        🔐 Private note will be encrypted using your saved Vault Code:
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
                        Enter Private vault code to encrypt note:
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
