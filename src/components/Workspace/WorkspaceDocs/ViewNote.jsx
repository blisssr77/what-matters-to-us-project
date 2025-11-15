import React from "react";
import { useEffect, useState, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { decryptText, encryptText } from "../../../lib/encryption";
import { useWorkspaceStore } from "../../../store/useWorkspaceStore";
import Layout from "../../Layout/Layout";
import { X, Copy, Edit2, Trash2 } from "lucide-react";
import dayjs from "dayjs";
import DOMPurify from "dompurify";
import ReadOnlyViewer from "../../Editors/ReadOnlyViewer";
import { generateJSON } from '@tiptap/html'
import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import FullscreenCard from "@/components/Layout/FullscreenCard";
import CardHeaderActions from "@/components/Layout/CardHeaderActions";

// HELPER for AI summarize - Utility to extract plain text from TipTap JSON
const extractPlainTextFromTiptap = (node) => {
  if (!node) return "";

  // text node
  if (node.type === "text" && node.text) {
    return node.text;
  }

  // nodes with children
  if (Array.isArray(node.content)) {
    return node.content.map(extractPlainTextFromTiptap).join(" ");
  }

  return "";
};

export default function WorkspaceViewNote() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { activeWorkspaceId } = useWorkspaceStore();

  const [vaultCode, setVaultCode] = useState("");
  const [noteData, setNoteData] = useState(null);
  const [decryptedNote, setDecryptedNote] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isVaulted, setIsVaulted] = useState(false);

  // AI summarize state
  const [publicSummary, setPublicSummary] = useState("");
  const [privateSummary, setPrivateSummary] = useState("");
  const [isSummarizingPublic, setIsSummarizingPublic] = useState(false);
  const [isSummarizingPrivate, setIsSummarizingPrivate] = useState(false);

  // Private (vaulted) note state
  const [privateJson, setPrivateJson] = useState(null)
  const [privateHtml, setPrivateHtml] = useState('')
  const [decryptErr, setDecryptErr] = useState('')

  // same flags as ViewDoc
  const [codeEntered, setCodeEntered] = useState(false);
  const [rememberCode, setRememberCode] = useState(false);

  // per-user, per-item storage key (note)
  const [storageKey, setStorageKey] = useState("ws_vault_code:anon");
  const autoFillTriedRef = useRef(false);
  // 15-minute TTL in ms
  const FIFTEEN_MIN = 15 * 60 * 1000;

  // --- expiring storage helpers ---
  const setExpiringItem = (key, value, ttlMs) => {
    const payload = { v: value, e: Date.now() + ttlMs };
    localStorage.setItem(key, JSON.stringify(payload));
  };
  const getExpiringItem = (key) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const { v, e } = JSON.parse(raw);
      if (Date.now() > e) {
        localStorage.removeItem(key);
        return null;
      }
      return v;
    } catch {
      return null;
    }
  };
  const removeExpiringItem = (key) => localStorage.removeItem(key);
  // --- end expiring storage helpers ---

  // build per-user, per-note key
  useEffect(() => {
    (async () => {
      const { data: { user } = {} } = await supabase.auth.getUser();
      const userId = user?.id ?? "anon";
      setStorageKey(`ws_vault_code:${userId}:note:${id}`);
    })();
  }, [id]);

  // Auto-fill vault code if previously remembered (once per mount) + auto-decrypt
  useEffect(() => {
    (async () => {
      if (!noteData?.is_vaulted) return;
      if (autoFillTriedRef.current) return; // only once per note id
      const remembered = getExpiringItem(storageKey);
      if (!remembered || codeEntered) return;

      setVaultCode(remembered);
      autoFillTriedRef.current = true;
      await handleDecrypt(remembered, true); // true = from remembered storage
    })();
  }, [noteData, storageKey]); // eslint-disable-line

  // ========================================== Load note ==========================================
  useEffect(() => {
    (async () => {
      if (!id || !activeWorkspaceId) return;

      const { data, error } = await supabase
        .from('workspace_vault_items')
        .select('*')
        .eq('id', id)
        .eq('workspace_id', activeWorkspaceId)
        .single();

      if (error) {
        console.error('Error fetching note:', error);
        setErrorMsg('Note not found or access denied.');
        return;
      }

      setNoteData(data);
      setIsVaulted(!!data.is_vaulted);

      // reset private view state on load
      setPrivateJson(null);
      setPrivateHtml('');
      setDecryptErr('');
      setCodeEntered(false);

      // For non-vaulted, show public content right away (back-compat with your UI)
      if (!data.is_vaulted) {
        // Prefer HTML column if present; else fallback to legacy plain text
        const html = data.public_note_html || '';
        const plain = data.notes || '';
        const content = html
          ? DOMPurify.sanitize(html)
          : plain;

        setDecryptedNote(content || '');
        setCodeEntered(true);
      }
    })();
  }, [id, activeWorkspaceId]);

  // ========================================== Handle decryption ================================================
  const handleDecrypt = async (maybeCode, isFromRememberedStorage = false) => {
    const code = String(maybeCode ?? vaultCode ?? '').trim();

    // Non-vaulted: nothing to decrypt
    if (!noteData?.is_vaulted) {
      setDecryptedNote(noteData?.public_note_html || noteData?.notes || '');
      setCodeEntered(true);
      return;
    }

    if (!code) {
      setErrorMsg('Please enter your Vault Code.');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    setDecryptErr('');
    setPrivateJson(null);
    setPrivateHtml('');

    // 1) Verify workspace code
    const { data: ok, error: vErr } = await supabase.rpc('verify_workspace_code', {
      p_workspace: activeWorkspaceId,
      p_code: code,
    });
    if (vErr) {
      setErrorMsg(vErr.message || 'Failed to verify Vault Code.');
      setLoading(false);
      return;
    }
    if (!ok) {
      setErrorMsg('Incorrect Vault Code.');
      setLoading(false);
      return;
    }

    // 2) Choose ciphertext/iv and format (new columns first, legacy fallback)
    const ciphertext =
      noteData?.private_note_ciphertext ||
      noteData?.encrypted_note ||
      null;

    const ivToUse =
      noteData?.private_note_iv ||
      noteData?.note_iv ||
      noteData?.iv ||
      null;

    const fmt = noteData?.private_note_format || 'tiptap_json';

    if (!ciphertext || !ivToUse) {
      setErrorMsg('This note has no encrypted content to decrypt.');
      setCodeEntered(true);
      setLoading(false);
      return;
    }

    // Helper: try both decryptText signatures to match your util
    const tryDecryptBoth = async () => {
      try {
        // common signature we’ve used elsewhere
        return await decryptText(ciphertext, code, ivToUse);
      } catch (_) {
        // your original signature from earlier code
        return await decryptText(ciphertext, ivToUse, code);
      }
    };

    // 3) Decrypt
    try {
      const plaintext = await tryDecryptBoth(); // UTF-8 string

      if (fmt === 'tiptap_json') {
        try {
          const parsed = JSON.parse(plaintext);
          setPrivateJson(parsed);
          // optional: keep decryptedNote for your old UI as plain text snapshot
          setDecryptedNote('[Encrypted TipTap content]');
        } catch {
          // if JSON parse fails, treat as HTML/text
          setPrivateHtml(DOMPurify.sanitize(plaintext));
          setDecryptedNote(DOMPurify.sanitize(plaintext));
        }
      } else if (fmt === 'html') {
        const clean = DOMPurify.sanitize(plaintext);
        setPrivateHtml(clean);
        setDecryptedNote(clean);
      } else {
        // unknown format, show safely
        const clean = DOMPurify.sanitize(plaintext);
        setPrivateHtml(clean);
        setDecryptedNote(clean);
      }

      setCodeEntered(true);

      // 4) remember-for-15-min (unchanged)
      const alreadyRemembered = !!getExpiringItem(storageKey);
      if (isFromRememberedStorage) {
        setExpiringItem(storageKey, code, FIFTEEN_MIN);
      } else if (rememberCode) {
        setExpiringItem(storageKey, code, FIFTEEN_MIN);
      } else if (alreadyRemembered) {
        setExpiringItem(storageKey, code, FIFTEEN_MIN);
      }
      sessionStorage.setItem('vaultCode', code);
    } catch (e) {
      console.error('Decryption failed:', e);
      setErrorMsg('Decryption failed. Please confirm your code and try again.');
      setDecryptErr('Decryption failed. Please confirm your code and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (decryptedNote) await navigator.clipboard.writeText(decryptedNote);
  };

  const handleDelete = async () => {
    setShowDeleteConfirm(false);
    await supabase.from("workspace_vault_items").delete().eq("id", id);
    navigate("/workspace/vaults");
  };

  // ===================== AI summarize - PUBLIC (workspace note) =====================
  const handleSummarizePublic = async () => {
    if (!noteData) return;

    // Prefer plain text notes; fallback to HTML if that's what you have
    const baseText = (
      noteData.notes ||
      noteData.public_note_html ||
      ""
    ).trim();

    if (!baseText) {
      setErrorMsg("No public text available to summarize.");
      return;
    }

    setErrorMsg("");
    setIsSummarizingPublic(true);

    try {
      const text = baseText;
      const type = "public";

      const API_URL = "https://what-matters-to-us-project-ov13.vercel.app/api/summarize-note";

      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, type }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        console.error(
          "summarize-note (workspace note - public) HTTP error:",
          res.status,
          errJson
        );
        setErrorMsg(
          errJson?.error ||
            "Failed to summarize public note. Please try again later."
        );
        return;
      }

      const data = await res.json();
      const summary = (data && data.summary) || "";

      setPublicSummary(summary);

      // Save summary for this note row
      const { error: updateError } = await supabase
        .from("workspace_vault_items")
        .update({ public_summary: summary })
        .eq("id", noteData.id)
        .eq("workspace_id", activeWorkspaceId);

      if (updateError) {
        console.error("Failed to save public_summary (note):", updateError);
        setErrorMsg("Summary generated but failed to save.");
      }
    } catch (err) {
      console.error("summarize-note (workspace note - public) exception:", err);
      setErrorMsg("Something went wrong while summarizing.");
    } finally {
      setIsSummarizingPublic(false);
    }
  };

  // ===================== AI summarize - PRIVATE (workspace note) =====================
  const handleSummarizePrivate = async () => {
    // 1) Build a meaningful baseText from decrypted content
    let baseText = "";

    // Prefer clean HTML if we have it
    if (privateHtml && privateHtml.trim()) {
      baseText = privateHtml;
    }
    // Else, try TipTap JSON
    else if (privateJson) {
      baseText = extractPlainTextFromTiptap(privateJson);
    }
    // Fallback to decryptedNote (for non-vaulted or legacy)
    else if (decryptedNote && decryptedNote.trim()) {
      baseText = decryptedNote;
    }

    if (!baseText || !baseText.trim()) {
      setErrorMsg("No private note content to summarize.");
      return;
    }

    const code = String(vaultCode || "").trim();
    if (!code) {
      setErrorMsg("Enter your Vault Code before summarizing the private note.");
      return;
    }

    setErrorMsg("");
    setIsSummarizingPrivate(true);

    try {
      const text = baseText.trim();
      const type = "private";

      const API_URL = "https://what-matters-to-us-project-ov13.vercel.app/api/summarize-note";

      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, type }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        console.error(
          "❌ summarize-note (workspace note - private) HTTP error:",
          res.status,
          errJson
        );
        setErrorMsg(
          errJson?.error ||
            "Failed to summarize private note. Please try again later."
        );
        return;
      }

      const data = await res.json();
      const summary = (data && data.summary) || "";

      // Encrypt the private summary with same Vault Code
      const { encryptedData, iv } = await encryptText(summary, code);

      const { error: updateError } = await supabase
        .from("workspace_vault_items")
        .update({
          private_summary: encryptedData,
          private_summary_iv: iv,
        })
        .eq("id", noteData.id)
        .eq("workspace_id", activeWorkspaceId);

      if (updateError) {
        console.error(
          "❌ Failed to save private_summary (note):",
          updateError
        );
        setErrorMsg("Private summary generated but failed to save.");
        return;
      }

      // Keep decrypted copy in state for this view
      setPrivateSummary(summary);
    } catch (err) {
      console.error(
        "❌ summarize-note (workspace note - private) exception:",
        err
      );
      setErrorMsg("Something went wrong while summarizing.");
    } finally {
      setIsSummarizingPrivate(false);
    }
  };

  // Utility to generate TipTap JSON from HTML (for privateJson fallback)
  const publicJson = useMemo(() => {
    if (!noteData?.public_note_html) return null
    return generateJSON(noteData.public_note_html, [
      StarterKit,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ])
  }, [noteData?.public_note_html])

// derived states
  const loadingNote = noteData === null

  return (
    <Layout>
      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
          <div className="fixed top-6 right-6 bg-gray-500/20 opacity-90 backdrop-blur-md shadow-md rounded-lg p-4 z-50 text-sm">
              <p className="mt-20 text-gray-800">
              Are you sure you want to delete {noteData?.title || "this note"}?
              </p>
              <div className="flex gap-3 justify-end mt-4">
              <button
                  onClick={async () => {
                  await handleDelete();
                  setShowDeleteConfirm(false);
                  }}
                  className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
              >
                  Yes, Delete
              </button>
              <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-3 py-1 bg-gray-300 text-gray-800 rounded hover:bg-gray-400"
              >
                  Cancel
              </button>
              </div>
          </div>
      )}

      <FullscreenCard className="max-w-3xl mx-auto p-6 bg-white rounded shadow border border-gray-200 mt-10 relative">
          <CardHeaderActions onClose={() => navigate('/workspace/vaults')} />

          {/* --- LOADING SKELETON WHILE FETCHING --- */}
          {loadingNote ? (
            <div className="animate-pulse space-y-3">
                <div className="h-6 w-1/3 bg-gray-200 rounded" />
                <div className="h-4 w-full bg-gray-200 rounded" />
                <div className="h-4 w-5/6 bg-gray-200 rounded" />
                <div className="h-24 w-full bg-gray-200 rounded" />
            </div>
            ) : (
              /* --- LOADED --- */
                <>
                  <div className="mt-10 flex items-start justify-between mb-2">
                  {/* Title + AI public summarize button */}
                  {noteData?.title && <h2 className="text-xl text-gray-800 font-bold mb-3">{noteData.title}</h2>}

                  
                </div>

                {/* Display tags content */}
                {Array.isArray(noteData?.tags) && noteData.tags.length > 0 && (
                    <div className="mb-3 text-sm font-bold text-gray-900">
                        Tags:{" "}
                        <div className="inline-block font-normal" />
                        {noteData.tags.map((tag, index) => (
                        <React.Fragment key={tag}>
                            <span className="bg-yellow-50 px-1 rounded font-extralight">{tag}</span>
                            {index < noteData.tags.length - 1 && ", "}
                        </React.Fragment>
                        ))}
                    </div>
                )}
                
                {/* Public note */}
                <div className="mb-2">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-sm font-bold text-gray-900 m-0 mb-1">Notes:</h2>

                      <button
                        onClick={handleSummarizePublic}
                        disabled={isSummarizingPublic || !noteData}
                        className={`
                          px-4 py-1.5 
                          rounded-md text-xs font-medium
                          flex items-center gap-1.5
                          border border-slate-300
                          bg-white
                          hover:bg-slate-100
                          text-slate-700
                          justify-self-end
                          shadow-sm hover:shadow transition-all
                          disabled:opacity-40 disabled:cursor-not-allowed
                        `}
                      >

                        {isSummarizingPublic ? (
                          <>
                            <svg
                              className="animate-spin h-4 w-4 text-slate-600"
                              xmlns="http://www.w3.org/2000/svg"
                              fill="none"
                              viewBox="0 0 24 24"
                            >
                              <circle
                                className="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                              ></circle>
                              <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                              ></path>
                            </svg>
                            Summarizing…
                          </>
                        ) : publicSummary ? (
                          <>
                            <span className="text-indigo-600">↻</span>
                            Refresh Summary
                          </>
                        ) : (
                          <>
                            <span className="text-indigo-600">✨</span>
                            Summarize Notes with AI
                          </>
                        )}
                      </button>
                  </div>

                  {publicJson ? (
                    <ReadOnlyViewer
                      json={publicJson}
                      className="wm-content text-sm text-gray-800 bg-white border border-gray-200 rounded p-3 mb-5"
                    />
                  ) : noteData?.public_note_html ? (
                    <ReadOnlyViewer
                      html={noteData.public_note_html}
                      className="wm-content prose max-w-none text-sm text-gray-800 bg-white border border-gray-200 rounded p-3 mb-4
                                [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:my-1"
                    />
                  ) : noteData?.notes ? (
                    <p className="text-sm text-gray-800 bg-white border border-gray-200 rounded p-3 mb-4">
                      {noteData.notes}
                    </p>
                  ) : (
                    <p className="text-sm text-gray-500 mb-4">No public note</p>
                  )}
                </div>

                {/* PUBLIC AI SUMMARY */}
                {publicSummary && (
                  <section className="mt-2 mb-8 rounded-md border border-indigo-200 bg-indigo-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-xs font-semibold text-indigo-800">
                        AI Summary (Public)
                      </h2>
                    </div>
                    <p className="mt-1 text-xs md:text-sm text-indigo-900 whitespace-pre-wrap">
                      {publicSummary}
                    </p>
                  </section>
                )}

                <div>
                {noteData?.is_vaulted && !codeEntered ? (
                  <>
                  <label className="block text-sm font-bold mt-6 text-gray-900">
                    Enter Private Vault Code to Decrypt Note:
                  </label>
                  {/* Vault code input */}
                  <div className="mt-1 flex items-center gap-3">
                    <input
                        type="password"
                        value={vaultCode}
                        onChange={(e) => setVaultCode(e.target.value)}
                        className="w-full p-2 border rounded text-sm text-gray-800"
                        placeholder="Vault Code"
                        autoComplete="current-password"
                    />
                    {/* Remember option for 15 minutes */}
                    <label className="flex items-center gap-2 text-xs text-gray-600">
                        <input
                        type="checkbox"
                        checked={rememberCode}
                        onChange={(e) => setRememberCode(e.target.checked)}
                        />
                          Remember code for 15 min
                    </label>
                    <button onClick={() => handleDecrypt()} disabled={loading} className="btn-secondary text-sm">
                        {loading ? "Decrypting..." : "Decrypt"}
                    </button>
                  </div>

                  {errorMsg && <p className="text-sm text-red-500 mt-2">{errorMsg}</p>}
                  </>
                ) : (
                  <>
                  {/* Private (vaulted) note + AI summarize button */}
                  {isVaulted && (
                    <div className="mt-2 mb-4">
                      {codeEntered ? (
                        <>
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-gray-900 mb-1 text-sm font-bold">Private note:</div>

                          <button
                            onClick={handleSummarizePrivate}
                            disabled={isSummarizingPrivate}
                            className={`
                              px-4 py-1.5 
                              rounded-md text-xs font-medium
                              flex items-center gap-1.5

                              border border-slate-300
                              bg-white
                              hover:bg-slate-100
                              text-slate-700

                              shadow-sm hover:shadow transition-all
                              disabled:opacity-40 disabled:cursor-not-allowed
                            `}
                          >
                            {isSummarizingPrivate ? (
                              <>
                                <svg
                                  className="animate-spin h-4 w-4 text-slate-600"
                                  xmlns="http://www.w3.org/2000/svg"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                >
                                  <circle
                                    className="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                  ></circle>
                                  <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                                  ></path>
                                </svg>
                                Summarizing…
                              </>
                            ) : privateSummary ? (
                              <>
                                <span className="text-purple-600">↻</span>
                                Refresh Private Summary
                              </>
                            ) : (
                              <>
                                <span className="text-purple-600">🔐</span>
                                Summarize Private Notes with AI
                              </>
                            )}
                          </button>
                        </div>

                        {decryptErr ? (
                          <div className="text-xs text-red-600 mb-2">{decryptErr}</div>
                          ) : (privateJson || privateHtml) ? (
                            <ReadOnlyViewer
                              json={privateJson}
                              html={privateHtml}
                              className="wm-content text-sm text-gray-800 bg-gray-100 border border-purple-200 rounded p-3"
                            />
                          ) : (
                            <div className="text-sm text-gray-600 bg-purple-50 border border-purple-200 rounded p-3">
                              Decrypting…
                            </div>
                          )}

                          {/* PRIVATE AI SUMMARY */}
                          {privateSummary && (
                            <div className="rounded-md border border-indigo-200 bg-indigo-50 p-3 mt-2">
                              <h3 className="text-xs font-semibold text-indigo-800">
                                AI Summary (Private)
                              </h3>
                              <p className="mt-1 text-xs md:text-sm text-indigo-900 whitespace-pre-wrap">
                                {privateSummary}
                              </p>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-xs text-gray-500">Enter your Vault Code to view the private note.</div>
                      )}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex items-center justify-end gap-4 text-xs mb-4 mt-8">
                      {/* <button
                          onClick={handleCopy}
                          className="flex items-center gap-1 text-purple-600 hover:underline"
                      >
                          <Copy size={16} />
                          Copy
                      </button> */}
                      <button
                          onClick={() => navigate(`/workspace/vaults/note-edit/${id}`)}
                          className="flex items-center gap-1 text-blue-600 hover:underline"
                      >
                          <Edit2 size={16} />
                          Edit Document
                      </button>
                      <button
                          onClick={() => setShowDeleteConfirm(true)}
                          className="flex items-center gap-1 text-red-600 hover:underline"
                      >
                          <Trash2 size={16} />
                          Delete Document
                      </button>
                  </div>

                  {noteData?.created_at && (
                      <div className="mb-1 text-xs text-gray-400">
                          Created: {dayjs(noteData.created_at).format("MMM D, YYYY h:mm A")}
                      </div>
                  )}
                  {noteData?.updated_at && (
                      <div className="mb-3 text-xs text-gray-400">
                          Updated: {dayjs(noteData.updated_at).format("MMM D, YYYY h:mm A")}
                      </div>
                  )}

                  <div className="mt-4 text-xs text-gray-400">
                      Last viewed just now · Private log only. Team audit history coming soon.
                  </div>
                  </>
                )}
              </div>
            </>
          )}
      </FullscreenCard>
    </Layout>
  );
}