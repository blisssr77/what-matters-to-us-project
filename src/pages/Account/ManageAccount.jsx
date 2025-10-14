import { useState, useEffect, useRef } from "react";
import { supabase, getSupabaseNoPersist } from "../../lib/supabaseClient";
import Layout from "../../components/Layout/Layout";
import { UploadCloud, Camera, Vault } from "lucide-react";
import bcrypt from "bcryptjs";
import { ShieldCheck, X, Check, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import PasswordChecklist from "./PasswordCheckList";
import PasswordField from "./PasswordField";
import VaultCodeField from "./VaultCodeField";
import VaultCodeChecklist, { buildCodeRules } from "./VaultCodeChecklist";
import { rotateWorkspaceCodeClient } from "@/utils/rotateWorkspaceCodeClient";
import { rotatePrivateCodeClient } from "@/utils/rotatePrivateCodeClient";

// A separate Supabase client instance that does NOT persist sessions
function slugifyUsername(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')     // keep [a-z0-9._-]
    .replace(/^-+|-+$/g, '')            // trim dashes
    .slice(0, 24) || null;              // cap length, return null if empty
}
// Find an available username by appending numbers if needed
async function findAvailableUsername(client, base) {
  const supa = client || supabase;
  let candidate = slugifyUsername(base) || 'user';
  let num = 0;

  // try up to N variants: user, user-1, user-2, ...
  for (let i = 0; i < 50; i += 1) {
    const check = await supa
      .from('profiles')
      .select('id')
      .eq('username', candidate)
      .maybeSingle();

    if (!check.data) return candidate; // available
    num += 1;
    candidate = `${slugifyUsername(base) || 'user'}-${num}`;
  }
  return `user-${crypto.randomUUID().slice(0, 8)}`;
}

export default function ManageAccount() {
    /* ────────────────── Profile / Basic Info state ────────────────── */
    const [avatar, setAvatar] = useState(null);
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [username, setUsername] = useState("");
    const [usernameErr, setUsernameErr] = useState("");
    const [isCheckingUsername, setIsCheckingUsername] = useState(false);
    const usernameTimer = useRef(null);
    const [basicSaved, setBasicSaved] = useState(false);

    /* ────────────────── Password state ────────────────── */
    const [currentPw, setCurrentPw] = useState("");
    const [newPw, setNewPw] = useState("");
    const [confirmPw, setConfirmPw] = useState("");
    const [pwErr, setPwErr] = useState("");
    const [pwdSaved, setPwdSaved] = useState(false);
    const [pwMatchNote, setPwMatchNote] = useState(""); // "", "checking", "good", "bad"
    const [currPwStatus, setCurrPwStatus] = useState(""); // "", "checking", "good", "bad"
    const currPwTimer = useRef(null);

    /* ────────────────── Vault Codes state ────────────────── */
    const [workspaceCode, setWorkspaceCode] = useState("");
    const [privateCode, setPrivateCode] = useState("");
    const [codes, setCodes] = useState({ workspace: undefined, private: undefined });
    const [workspaceCurrent, setWorkspaceCurrent] = useState("");
    const [workspaceConfirm, setWorkspaceConfirm] = useState("");
    const [privateCurrent, setPrivateCurrent] = useState("");
    const [privateConfirm, setPrivateConfirm] = useState("");

    /* cleanup password check timer */
    useEffect(() => {
      return () => {
        clearTimeout(currPwTimer.current);
        clearTimeout(usernameTimer.current);
      };
    }, []);

    /* feedback messages */
    const [workspaceMsg, setWorkspaceMsg] = useState(null); 
    const [privateMsg, setPrivateMsg]   = useState(null);

    const navigate = useNavigate();

    // Ensure a row exists in `profiles` for the signed-in user.
    // Optionally merge some fields if you already have them in state.
    async function ensureProfileExists(patch = {}) {
        const { data: { user } = {} } = await supabase.auth.getUser();
        if (!user?.id) return { ok: false, err: new Error('Not signed in') };
        const uid = user.id;

        // Do we already have a row?
        const { data: existing, error: selErr } = await supabase
            .from('profiles')
            .select('id, username')
            .eq('id', uid)
            .maybeSingle();
        if (selErr) return { ok: false, err: selErr };

        // If exists, optionally patch light fields and return
        if (existing?.id) {
            if (Object.keys(patch).length) {
            await supabase
                .from('profiles')
                .update({ ...patch, updated_at: new Date().toISOString() })
                .eq('id', uid);
            }
            return { ok: true };
        }

        // Need a username because column is NOT NULL
        // Prefer: provided patch.username → email local-part → uid fallback
        const rawFromPatch = patch.username;
        const rawFromEmail = user.email ? user.email.split('@')[0] : null;
        const base = rawFromPatch || rawFromEmail || `user-${uid.slice(0, 8)}`;
        const username = await findAvailableUsername(supabase, base);

        const insert = {
            id: uid,
            username,                                // <= guaranteed not null
            first_name: patch.first_name ?? null,
            last_name: patch.last_name ?? null,
            updated_at: new Date().toISOString(),
        };

        const { error: insErr } = await supabase
            .from('profiles')
            .upsert(insert, { onConflict: 'id' });

        if (insErr) return { ok: false, err: insErr };
        return { ok: true };
    }

    // one debounced checker instance per mount
    const checkUsernameUnique = (() => {
        let timer = null;

        return (raw) => {
            const value = raw ?? "";
            setUsername(value);          // keep input controlled
            setUsernameErr("");          // clear while we check

            clearTimeout(timer);
            const v = value.trim();
            if (!v) {
            // empty -> no error
            setUsernameErr("");
            return;
            }

            timer = setTimeout(async () => {
            try {
                const { data: { user } = {} } = await supabase.auth.getUser();
                const myId = user?.id ?? null;

                // Look up by username
                const { data, error, status } = await supabase
                .from("profiles")
                .select("id")          // keep select minimal to avoid 406
                .eq("username", v)
                .maybeSingle();

                if (error && status !== 406) {
                // don’t blow up the render tree
                console.warn("username check error", error);
                setUsernameErr("Could not validate username");
                return;
                }

                const takenByOther = !!(data?.id && data.id !== myId);
                setUsernameErr(takenByOther ? "Username is already taken" : "");
            } catch (e) {
                // swallow network/abort errors
                console.warn("username check exception", e);
                setUsernameErr("Could not validate username");
            }
            }, 300); // debounce
        };
    })();

    /* ────────────────── Get Basic User Info ────────────────── */
    useEffect(() => {
        const loadProfile = async () => {
            try {
            const { data: { user } } = await supabase.auth.getUser();

            if (!user) return; // not signed-in yet

            const { data, error, status } = await supabase
                .from("profiles")
                .select("first_name, last_name, username")
                .eq("id", user.id)
                .maybeSingle();      // ← won’t throw on 0 rows

            if (error && status !== 406) throw error; // 406 = no row, ignore
            if (data) {
                setFirstName(data.first_name || "");
                setLastName(data.last_name || "");
                setUsername(data.username || "");
            }
            } catch (err) {
            console.error("Profile load error:", err.message);
            }
        };

    loadProfile();
    }, []);

    /* ────────────────── Get User's Vault Codes Info ────────────────── */
    useEffect(() => {
        let alive = true;

        (async () => {
            try {
            const { data: { user } = {} } = await supabase.auth.getUser();
            if (!user?.id) {
                if (alive) setCodes({ workspace: false, private: false });
                return;
            }

            const { data, error, status } = await supabase
                .from("vault_codes")
                .select("workspace_code_hash, private_code_hash")
                .eq("id", user.id)
                .maybeSingle();

            if (error && status !== 406) {
                console.warn("vault_codes load error", error);
                if (alive) setCodes({ workspace: false, private: false }); // show CREATE forms
                return;
            }

            // status 406 or null data => no row yet => no codes set
            const hasWorkspace = !!data?.workspace_code_hash;
            const hasPrivate   = !!data?.private_code_hash;

            if (alive) setCodes({ workspace: hasWorkspace, private: hasPrivate });
            } catch (e) {
            console.warn("vault_codes exception", e);
            if (alive) setCodes({ workspace: false, private: false });
            }
        })();

        return () => { alive = false; };
    }, []);

    const refreshCodes = async () => {
        const { data: { user } = {} } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
            .from("vault_codes")
            .select("workspace_code_hash, private_code_hash")
            .eq("id", user.id)
            .maybeSingle();
        setCodes({
            workspace: !!(data?.workspace_code_hash),
            private:   !!(data?.private_code_hash),
        });
    };

    /* ────────────────── Helper functions ────────────────── */
    // Password rule checks
    const buildPwRules = (pwd, current) => ({
        lower: /[a-z]/.test(pwd),
        upper: /[A-Z]/.test(pwd),
        number: /[0-9]/.test(pwd),
        special: /[^A-Za-z0-9]/.test(pwd),
        length: pwd.length >= 8,
        notSameAsCurrent: (!pwd || !current) ? null : pwd !== current,
    });
    const pwRulesOk = (pwd, current) => {
        const r = buildPwRules(pwd, current);
        return r.lower && r.upper && r.number && r.special && r.length && r.notSameAsCurrent;
    };

    /* ────────────────── Save handlers (wire to Supabase) ────────────────── */
    const saveBasicInfo = async () => {
        if (usernameErr) return;
        await ensureProfileExists({ first_name: firstName, last_name: lastName, username });

        const { data: { user } } = await supabase.auth.getUser();

        // Upsert first
        const { error: upsertErr } = await supabase.from("profiles").upsert(
            {
            updated_at: new Date().toISOString(),
            id: user.id,
            first_name: firstName,
            last_name: lastName,
            username,
            },
            { onConflict: "id" }
        );

        if (upsertErr) {
            console.error("Save error:", upsertErr.message);
            return;
        }

        // Always fetch the fresh row afterwards
        const { data, error: fetchErr } = await supabase
            .from("profiles")
            .select("first_name, last_name, username")
            .eq("id", user.id)
            .single();

        if (fetchErr) {
            console.error("Fetch error:", fetchErr.message);
            return;
        }

        // Sync state + success flag
        setFirstName(data.first_name || "");
        setLastName(data.last_name || "");
        setUsername(data.username || "");
        setBasicSaved(true);
        setTimeout(() => setBasicSaved(false), 5000);
    };


    // Change password handler
    const onSubmitChangePassword = async (e) => {
        e.preventDefault(); // prevent refresh
        setPwErr("");

        // ensure profile exists even if password is changed first
        const ensured = await ensureProfileExists();
        if (!ensured.ok) return setPwErr(ensured.err?.message || 'Could not ensure profile');

        if (currPwStatus !== "good") return setPwErr("Please confirm your current password first.");
        if (newPw !== confirmPw)    return setPwErr("Passwords do not match.");
        if (newPw === currentPw)    return setPwErr("New password cannot be the same as current password.");
        if (!newOk)                 return setPwErr("Password rules not met.");

        const { error } = await supabase.auth.updateUser({ password: newPw });
        if (error) return setPwErr(error.message);

        setPwdSaved(true);
        setCurrentPw(""); setNewPw(""); setConfirmPw("");
        setCurrPwStatus("");
        setTimeout(() => setPwdSaved(false), 4000);
    };

    // Verify current vault code
    const verifyWorkspaceCurrent = async (val) => {
        const { data: ok, error } = await supabase.rpc("verify_user_vault_code", { p_code: val.trim() });
        if (error) return false;
        return !!ok;
    };
    // Verify private vault code
    const verifyPrivateCurrent = async (val) => {
        const { data: ok, error } = await supabase.rpc("verify_user_private_code", { p_code: val.trim() });
        if (error) return false;
        return !!ok;
    };

    /** Helper: list workspace ids the current user is a member of */
    async function getUserWorkspaceIds() {
        const { data: { user } = {} } = await supabase.auth.getUser();
        if (!user) return [];

        const { data, error } = await supabase
            .from("workspace_members")
            .select("workspace_id")
            .eq("user_id", user.id);

        if (error) {
            console.error("Failed to fetch user workspaces:", error);
            return [];
        }
        return (data || []).map(r => r.workspace_id);
    }

    /* ────────────────── Save Vault Code handlers (wire to Supabase) ────────────────── */
    /* ────────────── CREATE WORKSPACE CODE ────────────── */
    const createWorkspaceCode = async () => {
        if (!workspaceCode || !workspaceConfirm) return { ok: false, msg: 'Enter code and confirmation' };
        if (workspaceCode !== workspaceConfirm)   return { ok: false, msg: 'Codes do not match' };

        // Ensure a profile row exists first
        const ensured = await ensureProfileExists();
        if (!ensured.ok) return { ok: false, msg: ensured.err?.message || 'Could not ensure profile' };

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { ok: false, msg: 'User not signed-in' };

        const newCode = workspaceCode.trim();
        const { error } = await supabase.rpc('set_user_vault_code', { p_code: newCode });
        if (error) return { ok: false, msg: error.message || 'Failed to save code' };

        setWorkspaceCode(''); setWorkspaceConfirm('');
        setCodes((c) => ({ ...c, workspace: true }));
        return { ok: true, msg: 'Workspace code created successfully ' };
    };


    /* ────────────── CHANGE WORKSPACE CODE ────────────── */
    /*   Verify old → rotate all workspaces → set new hash */
    const changeWorkspaceCode = async () => {
        if (!workspaceCurrent || !workspaceCode || !workspaceConfirm)
            return { ok: false, msg: "All fields are required" };
        if (workspaceCode !== workspaceConfirm)
            return { ok: false, msg: "New codes do not match" };

        // ensure profile
        const ensured = await ensureProfileExists();
        if (!ensured.ok) return { ok: false, msg: ensured.err?.message || 'Could not ensure profile' };

        const oldCode = workspaceCurrent.trim();
        const newCode = workspaceCode.trim();

        // 1) verify current per-user code
        const { data: ok, error: vErr } = await supabase.rpc("verify_user_vault_code", {
            p_code: oldCode,
        });
        if (vErr) return { ok: false, msg: vErr.message || "Verify failed" };
        if (!ok)  return { ok: false, msg: "Current code is incorrect." };

        // 2) rotate all vaulted content in ALL workspaces the user is in
        try {
            const workspaceIds = await getUserWorkspaceIds(); // or [activeWorkspaceId] if you prefer
            for (const wid of workspaceIds) {
            // progress callback is optional
            await rotateWorkspaceCodeClient(wid, oldCode, newCode, (i, total) => {
                // e.g. show progress to user
                // console.log(`Workspace ${wid}: rotated ${i}/${total}`);
            });
            }
        } catch (e) {
            console.error("Rotation failed:", e);
            // Surface to UI. Nothing is corrupted; items already rotated are safe.
            return { ok: false, msg: e.message || "Rotation failed. Please retry." };
        }

        // 3) once rotation is complete, set the new hash
        const { error } = await supabase.rpc("set_user_vault_code", { p_code: newCode });
        if (error) return { ok: false, msg: error.message || "Update failed" };

        // cleanup UI state
        setWorkspaceCurrent("");
        setWorkspaceCode("");
        setWorkspaceConfirm("");
        return { ok: true, msg: "Workspace code updated & content rotated " };
    };

    /* ────────────── CREATE PRIVATE CODE ────────────── */
    /*   Verify old → rotate all privatespaces → set new hash */
    const createPrivateCode = async () => {
        if (!privateCode || !privateConfirm) return { ok: false, msg: 'Enter code and confirmation' };
        if (privateCode !== privateConfirm)   return { ok: false, msg: 'Codes do not match' };

        // ensure profile
        const ensured = await ensureProfileExists();
        if (!ensured.ok) return { ok: false, msg: ensured.err?.message || 'Could not ensure profile' };

        const { error } = await supabase.rpc('set_user_private_code', { p_code: privateCode.trim() });
        if (error) return { ok: false, msg: error.message || 'Failed to save code' };

        setPrivateCode(''); setPrivateConfirm('');
        setCodes((c) => ({ ...c, private: true }));
        return { ok: true, msg: 'Private code created successfully ' };
    };


    /* ────────────── CHANGE PRIVATE CODE ────────────── */
    const changePrivateCode = async () => {
        if (!privateCurrent || !privateCode || !privateConfirm)
            return { ok: false, msg: "All fields are required" };
        if (privateCode !== privateConfirm)
            return { ok: false, msg: "New codes do not match" };

         // ensure profile
        const ensured = await ensureProfileExists();
        if (!ensured.ok) return { ok: false, msg: ensured.err?.message || 'Could not ensure profile' };

        const oldCode = privateCurrent.trim();
        const newCode = privateCode.trim();

        // 1) verify current (user-level)
        const { data: ok, error: vErr } = await supabase.rpc("verify_user_private_code", {
            p_code: oldCode,
        });
        if (vErr) return { ok: false, msg: vErr.message || "Verify failed" };
        if (!ok)  return { ok: false, msg: "Current code is incorrect." };

        // 2) rotate ALL vaulted items across user's private spaces
        try {
            await rotatePrivateCodeClient(oldCode, newCode, (i, total) => {
            // optional progress hook
            // console.log(`Rotated private items ${i}/${total}`);
            });
        } catch (e) {
            console.error("Private rotation failed:", e);
            return { ok: false, msg: e.message || "Rotation failed. Please retry." };
        }

        // 3) set new private code hash once rotation succeeds
        const { error } = await supabase.rpc("set_user_private_code", { p_code: newCode });
        if (error) return { ok: false, msg: error.message || "Update failed" };

        setPrivateCurrent(""); setPrivateCode(""); setPrivateConfirm("");
        return { ok: true, msg: "Private code updated & content rotated " };
    };

    

    /* ────────────────── Password status & rules ────────────────── */
    const rules  = buildPwRules(newPw, currentPw);
    const newOk  = pwRulesOk(newPw, currentPw);
    const confirmOk = !!confirmPw && confirmPw === newPw && newOk;
    /* ────────────────── Vault Code status & rules ────────────────── */
    const wsRules = buildCodeRules(workspaceCode, workspaceCurrent, 6);
    const wsNewOk = wsRules.length && wsRules.noSpace;
    const wsConfirmOk = !!workspaceConfirm && workspaceConfirm === workspaceCode && wsNewOk;
    /* ────────────────── Private Code status & rules ────────────────── */
    const prRules = buildCodeRules(privateCode, privateCurrent, 6);
    const prNewOk = prRules.length && prRules.noSpace;
    const prConfirmOk = !!privateConfirm && privateConfirm === privateCode && prNewOk;

    /* ────────────────── UI ────────────────── */
    // Workspace Card
    return (
        <Layout>
        <div className="max-w-4xl mx-auto bg-white/95 backdrop-blur p-8 rounded-xl shadow-lg">
            {/* Close button to navigate back */}
            <button
                onClick={() => {
                    navigate("/dashboard");
                }}
                className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
                >
                <X size={20} />
            </button>
            <h1 className="text-2xl font-bold text-gray-800 mb-8">Manage Account</h1>

            {/* ========== Profile Photo ========== */}
            <div className="mb-12">
                <h2 className="text-lg font-semibold mb-4 text-gray-800">Profile photo</h2>
                <div className="flex items-start gap-4">
                    <div className="w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center text-3xl font-bold text-purple-600 overflow-hidden">
                    {avatar ? <img src={URL.createObjectURL(avatar)} className="object-cover w-full h-full" /> : "R"}
                    </div>
                    <div>
                        <p className="text-sm text-gray-600">Upload your photo …</p>
                        <p className="text-xs text-gray-400 mb-2">Photo should be at least 300 × 300 px</p>
                        <div className="flex gap-2">
                            <label className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border rounded cursor-pointer hover:bg-purple-50 text-gray-800">
                            <UploadCloud size={14} /> Upload
                            <input type="file" className="hidden" onChange={(e) => setAvatar(e.target.files[0])} />
                            </label>
                            <button className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border rounded hover:bg-purple-50 text-gray-800">
                            <Camera size={14} /> Take Photo
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* ========== Basic Info & Password (stacked) ========== */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 mb-12">
            {/* Basic */}
            <div className="text-gray-800">
                <h2 className="text-lg font-semibold mb-4 ">Basic information</h2>
                <div className="space-y-3">
                <input
                    value={username}
                    onChange={(e) => checkUsernameUnique(e.target.value)}
                    placeholder="Unique username"
                    className="w-full border rounded px-3 py-2 text-sm"
                />
                {usernameErr && <p className="text-xs text-red-500 -mt-2">{usernameErr}</p>}
                <div className="flex gap-3">
                    <input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="First name"
                    className="w-full border rounded px-3 py-2 text-sm"
                    />
                    <input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Last name"
                    className="w-full border rounded px-3 py-2 text-sm"
                    />
                </div>
                <div className="flex justify-end">
                    <button onClick={saveBasicInfo} className="btn-secondary text-sm">
                        Save basic info
                    </button>
                </div>

                {basicSaved && (
                    <p className="flex justify-center text-xs text-green-600 mt-2">Profile saved successfully!</p>
                )}
                </div>
            </div>

            {/* Password */}
            <div className="text-gray-800">
                <h2 className="text-lg font-semibold mb-4">Change password</h2>

                <form onSubmit={onSubmitChangePassword} noValidate className="space-y-3">
                {/* Current password */}
                <PasswordField
                    id="current-password"
                    name="current-password"
                    autoComplete="current-password"
                    label="Current password"
                    value={currentPw}
                    onChange={(e) => {
                        const val = e.target.value;
                        setCurrentPw(val);
                        setPwErr("");
                        clearTimeout(currPwTimer.current);

                        if (val.length < 6) {
                        setCurrPwStatus("");
                        return;
                        }

                        setCurrPwStatus("checking");
                        currPwTimer.current = setTimeout(async () => {
                        const { data: { session } = {} } = await supabase.auth.getSession();
                        const email = session?.user?.email;
                        if (!email) return setCurrPwStatus("bad");

                        const { error } = await supabaseNoPersist.auth.signInWithPassword({ email, password: val });
                        setCurrPwStatus(error ? "bad" : "good");
                        }, 800);
                    }}
                    status={currPwStatus || "idle"}
                />

                {/* New password */}
                <PasswordField
                    id="new-password"
                    name="new-password"
                    autoComplete="new-password"
                    label="New password"
                    value={newPw}
                    onChange={(e) => { setNewPw(e.target.value); setPwErr(""); }}
                    status={newPw ? (newOk ? "good" : "bad") : "idle"}
                />

                {/* Confirm new password */}
                <PasswordField
                    id="confirm-password"
                    name="confirm-password"
                    autoComplete="new-password"  // recommended for confirm field too
                    label="Confirm new password"
                    value={confirmPw}
                    onChange={(e) => { setConfirmPw(e.target.value); setPwErr(""); }}
                    status={confirmPw ? (confirmOk ? "good" : "bad") : "idle"}
                />

                {/* Rules + error */}
                {pwErr && <p className="text-xs text-red-500">{pwErr}</p>}
                <PasswordChecklist rules={rules} />

                <div className="flex justify-end">
                    <button type="submit" className="btn-secondary text-sm">
                    Update password
                    </button>
                </div>

                {pwdSaved && (
                    <p className="flex justify-center text-xs text-green-600 mt-2">
                    Password updated successfully!
                    </p>
                )}
                </form>
            </div>
        </div>

        {/* ==================================================== Vault Codes ============================================= */}
        <h2 className="text-xl font-semibold text-blue-900 flex items-center gap-2">
            <ShieldCheck size={28} className="text-blue-700" />
            Vault codes
            
        </h2>
        <p className="text-sm text-gray-800 mb-4">
            Vault Codes are like personal encryption passwords used to lock or unlock your secure notes and files.
            <span className="block text-red-400 mt-1 font-medium">
                This cannot be recovered if forgotten. Make sure it’s memorable or saved securely.
            </span>
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Workspace Card */}
            <div
                className={[
                "p-5 rounded border transition-colors",
                // neutral look while loading/undefined
                codes.workspace === undefined
                    ? "bg-gray-50 border-gray-200"
                    // CHANGE form (code exists)
                    : codes.workspace
                    ? "bg-indigo-100 border-indigo-300"
                    // CREATE form (no code)
                    : "bg-blue-50 border-blue-200"
                ].join(" ")}
            >
                {codes.workspace === undefined ? (
                    // small skeleton (prevents the whole section from disappearing)
                    <div className="animate-pulse space-y-2">
                    <div className="h-4 w-2/3 bg-gray-200 rounded" />
                    <div className="h-8 bg-gray-200 rounded" />
                    <div className="h-8 bg-gray-200 rounded" />
                    </div>
                ) : codes.workspace ? (
                    /* CHANGE form (codes.workspace !== null) */
                    <>
                        <h3 className="font-medium mb-4 text-gray-900">Change your Workspace vault code</h3>

                        <VaultCodeField
                            className="text-gray-800"
                            id="ws-current"
                            label="Current workspace code"
                            autoComplete="current-password"
                            value={workspaceCurrent}
                            onChange={(e) => setWorkspaceCurrent(e.target.value)}
                            verifyAsync={verifyWorkspaceCurrent}  // live RPC verify
                        />

                        <VaultCodeField
                            className="text-gray-800 mt-2"
                            id="ws-new"
                            label="New code"
                            autoComplete="new-password"
                            value={workspaceCode}
                            onChange={(e) => setWorkspaceCode(e.target.value)}
                            statusProp={!workspaceCode ? "idle" : (wsNewOk ? "good" : "bad")}
                        />

                        <VaultCodeField
                            className="text-gray-800 mt-2"
                            id="ws-confirm"
                            label="Confirm new code"
                            autoComplete="new-password"
                            value={workspaceConfirm}
                            onChange={(e) => setWorkspaceConfirm(e.target.value)}
                            statusProp={!workspaceConfirm ? "idle" : (wsConfirmOk ? "good" : "bad")}
                        />

                        <VaultCodeChecklist rules={wsRules} className="mt-2" />

                        <div className="flex justify-end mt-3">
                            <button
                                type="button"
                                className="btn-secondary text-sm"
                                onClick={async () => {
                                    const { ok, msg } = await changeWorkspaceCode();
                                    setWorkspaceMsg({ ok, msg });
                                }}
                                disabled={!wsNewOk || !wsConfirmOk}
                            >
                                Change code
                            </button>
                        </div>

                        {workspaceMsg?.ok ? (
                            <p className="flex justify-center text-xs text-green-600 mt-4">{workspaceMsg.msg}</p>
                        ) : workspaceMsg?.msg ? (
                            <p className="flex justify-center text-xs text-red-500 mt-4">{workspaceMsg.msg}</p>
                        ) : null}
                    </>
                ) : (
                    /* CREATE form */
                    <>
                        <h3 className="font-medium mb-3 text-gray-900">Create a new Workspace vault code</h3>

                        <VaultCodeField
                            className="text-gray-800"
                            id="ws-new"
                            label="Create workspace code"
                            autoComplete="new-password"
                            value={workspaceCode}
                            onChange={(e) => setWorkspaceCode(e.target.value)}
                            // drive status manually for "new" field
                            statusProp={!workspaceCode ? "idle" : (wsNewOk ? "good" : "bad")}
                        />

                        <VaultCodeField
                            id="ws-confirm"
                            label="Confirm code"
                            autoComplete="new-password"
                            value={workspaceConfirm}
                            onChange={(e) => setWorkspaceConfirm(e.target.value)}
                            statusProp={!workspaceConfirm ? "idle" : (wsConfirmOk ? "good" : "bad")}
                            className="mt-2 text-gray-800"
                        />

                        <VaultCodeChecklist rules={buildCodeRules(workspaceCode, "", 6)} className="mt-2" />

                        <div className="flex justify-end mt-3">
                            <button
                                type="button"
                                className="btn-secondary text-sm"
                                onClick={async () => {
                                    const { ok, msg } = await createWorkspaceCode();
                                    setWorkspaceMsg({ ok, msg });
                                }}
                                disabled={!wsNewOk || !wsConfirmOk}
                            >
                                Create code
                            </button>
                        </div>

                        {workspaceMsg?.ok ? (
                            <p className="flex justify-center text-xs text-green-600 mt-4">{workspaceMsg.msg}</p>
                        ) : workspaceMsg?.msg ? (
                            <p className="flex justify-center text-xs text-red-500 mt-4">{workspaceMsg.msg}</p>
                        ) : null}
                    </>
                )}
            </div>

            {/* Private Card */}
            <div
                className={[
                    "p-5 rounded border transition-colors",
                    codes.private === undefined
                    ? "bg-gray-50 border-gray-200"
                    : codes.private
                    ? "bg-pink-100 border-pink-300"              // CHANGE styling
                    : "bg-red-50 border-red-200"                // CREATE styling
                ].join(" ")}
            >
                {codes.private === undefined ? (
                    <div className="animate-pulse space-y-2">
                    <div className="h-4 w-2/3 bg-gray-200 rounded" />
                    <div className="h-8 bg-gray-200 rounded" />
                    <div className="h-8 bg-gray-200 rounded" />
                    </div>
                ) : codes.private ? (
                    // CHANGE
                    <>
                        <h3 className="font-medium mb-4 text-gray-900">
                            Change your Private vault code
                        </h3>

                        <VaultCodeField
                            className="text-gray-800"
                            id="pr-current"
                            label="Current private vault code"
                            autoComplete="current-password"
                            value={privateCurrent}
                            onChange={(e) => setPrivateCurrent(e.target.value)}
                            verifyAsync={verifyPrivateCurrent}   // debounced RPC verification + ✓/×/spinner
                        />

                        <VaultCodeField
                            className="text-gray-800 mt-2"
                            id="pr-new"
                            label="New code"
                            autoComplete="new-password"
                            value={privateCode}
                            onChange={(e) => setPrivateCode(e.target.value)}
                            statusProp={!privateCode ? "idle" : prNewOk ? "good" : "bad"}
                        />

                        <VaultCodeField
                            className="text-gray-800 mt-2"
                            id="pr-confirm"
                            label="Confirm new code"
                            autoComplete="new-password"
                            value={privateConfirm}
                            onChange={(e) => setPrivateConfirm(e.target.value)}
                            statusProp={!privateConfirm ? "idle" : prConfirmOk ? "good" : "bad"}
                        />

                        <VaultCodeChecklist rules={prRules} className="mt-2" />

                        <div className="flex justify-end mt-3">
                            <button
                            type="button"
                            className="btn-secondary text-sm"
                            onClick={async () => {
                                const { ok, msg } = await changePrivateCode();
                                setPrivateMsg({ ok, msg });
                            }}
                            disabled={!prNewOk || !prConfirmOk}
                            >
                            Change code
                            </button>
                        </div>

                        {privateMsg?.ok ? (
                            <p className="flex justify-center text-xs text-green-600 mt-4">{privateMsg.msg}</p>
                        ) : privateMsg?.msg ? (
                            <p className="flex justify-center text-xs text-red-500 mt-4">{privateMsg.msg}</p>
                        ) : null}
                    </>
                    ) : (
                    // CREATE
                    <>
                        <h3 className="font-medium mb-4 text-gray-900">
                            Create a new Private vault code
                        </h3>

                        <VaultCodeField
                            className="text-gray-800"
                            id="pr-new"
                            label="Create private code"
                            autoComplete="new-password"
                            value={privateCode}
                            onChange={(e) => setPrivateCode(e.target.value)}
                            statusProp={!privateCode ? "idle" : prNewOk ? "good" : "bad"}
                        />

                        <VaultCodeField
                            className="text-gray-800 mt-2"
                            id="pr-confirm"
                            label="Confirm code"
                            autoComplete="new-password"
                            value={privateConfirm}
                            onChange={(e) => setPrivateConfirm(e.target.value)}
                            statusProp={!privateConfirm ? "idle" : prConfirmOk ? "good" : "bad"}
                        />

                        <VaultCodeChecklist
                            rules={buildCodeRules(privateCode, "", 6)}  // neutral for "not same" until current is provided
                            className="mt-2"
                        />

                        <div className="flex justify-end mt-3">
                            <button
                            type="button"
                            className="btn-secondary text-sm"
                            onClick={async () => {
                                const { ok, msg } = await createPrivateCode();
                                setPrivateMsg({ ok, msg });
                            }}
                            disabled={!prNewOk || !prConfirmOk}
                            >
                            Create code
                            </button>
                        </div>

                        {privateMsg?.ok ? (
                            <p className="flex justify-center text-xs text-green-600 mt-4">{privateMsg.msg}</p>
                        ) : privateMsg?.msg ? (
                            <p className="flex justify-center text-xs text-red-500 mt-4">{privateMsg.msg}</p>
                        ) : null}
                    </>
                )}
            </div>
        </div>
        </div>
        </Layout>
    );
}
