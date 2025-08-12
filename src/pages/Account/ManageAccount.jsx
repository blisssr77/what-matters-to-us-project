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

export default function ManageAccount() {
    /* ────────────────── Profile / Basic Info state ────────────────── */
    const [avatar, setAvatar] = useState(null);
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [username, setUsername] = useState("");
    const [usernameErr, setUsernameErr] = useState("");
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
    const [codes, setCodes] = useState({ workspace: null, private: null });
    const [workspaceCurrent, setWorkspaceCurrent] = useState("");
    const [workspaceConfirm, setWorkspaceConfirm] = useState("");
    const [privateCurrent, setPrivateCurrent] = useState("");
    const [privateConfirm, setPrivateConfirm] = useState("");

    /* cleanup password check timer */
    useEffect(() => () => clearTimeout(currPwTimer.current), []);

    /* feedback messages */
    const [workspaceMsg, setWorkspaceMsg] = useState(null); 
    const [privateMsg, setPrivateMsg]   = useState(null);

    const navigate = useNavigate();

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
        const getCodes = async () => {
            const { data: { user } = {} } = await supabase.auth.getUser();
            if (!user) return;

            // 1) Try the new hash columns
            let { data, error } = await supabase
            .from("vault_codes")
            .select("workspace_code_hash, private_code_hash")
            .eq("id", user.id)
            .maybeSingle();

            // 2) Fallback to legacy encrypted column names if needed
            if (error) {
            // legacy: workspace_code + private_code
            const legacy = await supabase
                .from("vault_codes")
                .select("workspace_code, private_code")
                .eq("id", user.id)
                .maybeSingle();

            if (legacy.error) {
                // some older DBs used 'priva_code'
                const legacy2 = await supabase
                .from("vault_codes")
                .select("workspace_code, priva_code")
                .eq("id", user.id)
                .maybeSingle();

                if (!legacy2.error) data = legacy2.data;
            } else {
                data = legacy.data;
            }
            }

            // 3) Derive booleans without exposing values in UI
            if (data) {
            const hasWorkspace =
                !!(data.workspace_code_hash ?? data.workspace_code);
            const hasPrivate =
                !!(data.private_code_hash ?? data.private_code ?? data.priva_code);

            setCodes({ workspace: hasWorkspace, private: hasPrivate });
            }
        };

        getCodes();
    }, []);


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

    /* ────────────────── Save Vault Code handlers (wire to Supabase) ────────────────── */
    /* ────────────── CREATE WORKSPACE CODE ────────────── */
    const createWorkspaceCode = async () => {
        if (!workspaceCode || !workspaceConfirm)
            return { ok: false, msg: "Enter code and confirmation" };
        if (workspaceCode !== workspaceConfirm)
            return { ok: false, msg: "Codes do not match" };

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { ok: false, msg: "User not signed-in" };

        const { error } = await supabase.rpc("set_user_vault_code", {
            p_code: workspaceCode.trim(),
        });
        if (error) return { ok: false, msg: error.message || "Failed to save code" };

        setWorkspaceCode(""); 
        setWorkspaceConfirm("");
        setCodes((c) => ({ ...c, workspace: true }));
        return { ok: true, msg: "Workspace code created successfully ✅" };
    };


    /* ────────────── CHANGE WORKSPACE CODE ────────────── */
    const changeWorkspaceCode = async () => {
        if (!workspaceCurrent || !workspaceCode || !workspaceConfirm)
            return { ok: false, msg: "All fields are required" };
        if (workspaceCode !== workspaceConfirm)
            return { ok: false, msg: "New codes do not match" };

        // 1) verify current
        const { data: ok, error: vErr } = await supabase.rpc("verify_user_vault_code", {
            p_code: workspaceCurrent.trim(),
        });
        if (vErr) return { ok: false, msg: vErr.message || "Verify failed" };
        if (!ok)  return { ok: false, msg: "Current code is incorrect." };

        // 2) set new
        const { error } = await supabase.rpc("set_user_vault_code", {
            p_code: workspaceCode.trim(),
        });
        if (error) return { ok: false, msg: error.message || "Update failed" };

        setWorkspaceCurrent(""); 
        setWorkspaceCode(""); 
        setWorkspaceConfirm("");
        return { ok: true, msg: "Workspace code updated successfully ✅" };
    };


    /* ────────────── CREATE PRIVATE CODE ────────────── */
    const createPrivateCode = async () => {
        if (!privateCode || !privateConfirm)
            return { ok: false, msg: "Enter code and confirmation" };
        if (privateCode !== privateConfirm)
            return { ok: false, msg: "Codes do not match" };

        const { error } = await supabase.rpc("set_user_private_code", {
            p_code: privateCode.trim(),
        });
        if (error) return { ok: false, msg: error.message || "Failed to save code" };

        setPrivateCode(""); 
        setPrivateConfirm("");
        setCodes((c) => ({ ...c, private: true }));
        return { ok: true, msg: "Private code created successfully ✅" };
    };


    /* ────────────── CHANGE PRIVATE CODE ────────────── */
    const changePrivateCode = async () => {
        if (!privateCurrent || !privateCode || !privateConfirm)
            return { ok: false, msg: "All fields are required" };
        if (privateCode !== privateConfirm)
            return { ok: false, msg: "New codes do not match" };

        const { data: ok, error: vErr } = await supabase.rpc("verify_user_private_code", {
            p_code: privateCurrent.trim(),
        });
        if (vErr) return { ok: false, msg: vErr.message || "Verify failed" };
        if (!ok)  return { ok: false, msg: "Current code is incorrect." };

        const { error } = await supabase.rpc("set_user_private_code", {
            p_code: privateCode.trim(),
        });
        if (error) return { ok: false, msg: error.message || "Update failed" };

        setPrivateCurrent(""); setPrivateCode(""); setPrivateConfirm("");
        return { ok: true, msg: "Private code updated successfully ✅" };
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
        <p className="text-sm text-gray-700 mb-4">
            Vault Codes are like personal encryption passwords used to lock or unlock your secure notes and files.
        <span className="block text-red-400 mt-1 font-medium">
            This cannot be recovered if forgotten. Make sure it’s memorable or saved securely.
        </span>
        </p>

        {/* Workspace Card */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="p-5 bg-gray-50 rounded border">
            <>
                {codes.workspace === null ? (
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
                            className="mt-2"
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
                ) : (
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
                )}
            </>
        </div>

        {/* Private Card */}
        <div className="p-5 bg-gray-50 rounded border">
            {codes.private === null ? (
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
            ) : (
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
            )}
        </div>
    </div>
    </div>
    </Layout>
    );
}
