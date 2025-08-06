import { useState, useEffect, useRef } from "react";
import { supabase } from "../../lib/supabaseClient";
import Layout from "../../components/Layout/Layout";
import { UploadCloud, Camera } from "lucide-react";
import bcrypt from "bcryptjs";
import { ShieldCheck, X } from "lucide-react";
import { useNavigate } from "react-router-dom";


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
    const [pwMatchNote, setPwMatchNote] = useState(""); // "" | "match" | "no-match"
    const [currPwStatus, setCurrPwStatus] = useState(""); // "" | "correct" | "incorrect"
    const currPwTimer = useRef(null);

    /* ────────────────── Vault Codes state ────────────────── */
    const [workspaceCode, setWorkspaceCode] = useState("");
    const [privateCode, setPrivateCode] = useState("");
    const [codes, setCodes] = useState({ workspace: null, private: null });
    const [workspaceCurrent, setWorkspaceCurrent] = useState("");
    const [workspaceConfirm, setWorkspaceConfirm] = useState("");
    const [privateCurrent, setPrivateCurrent] = useState("");
    const [privateConfirm, setPrivateConfirm] = useState("");

    /* feedback messages */
    const [workspaceMsg, setWorkspaceMsg] = useState(null); // { ok, msg }
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
            const {
            data: { user },
            } = await supabase.auth.getUser();
            if (!user) return;

            const { data, error } = await supabase
            .from("vault_codes")
            .select("workspace_code, private_code")
            .eq("id", user.id)
            .maybeSingle();           // returns null instead of throwing

            if (!error && data) {
            setCodes({
                workspace: !!data.workspace_code, // true if a hash exists
                private:   !!data.private_code,
            });
            }
        };

    getCodes();
    }, []);

    /* cleanup password check timer */
    useEffect(() => () => clearTimeout(currPwTimer.current), []);

    /* ────────────────── Helper functions ────────────────── */
    const checkUsernameUnique = async (val) => {
        setUsername(val);
        if (!val) return setUsernameErr("Username cannot be empty");
        const { data } = await supabase.from("profiles").select("id").eq("username", val).single();
        setUsernameErr(data ? "Username already taken" : "");
    };

    const pwRulesOk = (pw) =>
        /[a-z]/.test(pw) &&
        /[A-Z]/.test(pw) &&
        /[0-9]/.test(pw) &&
        /[^A-Za-z0-9]/.test(pw) &&
        pw.length >= 8;

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


    const changePassword = async () => {
        setPwErr("");

        // 1) Client-side checks
        if (newPw !== confirmPw)
            return setPwErr("Passwords do not match");
        if (!pwRulesOk(newPw))
            return setPwErr("Password rules not met");

        // 2) Supabase update
        const { error } = await supabase.auth.updateUser({ password: newPw });
        if (error) {
            setPwErr(error.message);      // Show server error
        } else {
            setPwdSaved(true);            // Show ✓ success
            setTimeout(() => setPwdSaved(false), 10000);
        }
    };

    /* ────────────────── Save Vault Code handlers (wire to Supabase) ────────────────── */
    /* ------------------------------------------------------------------
    /* ────────────── CREATE WORKSPACE CODE ────────────── */
    const createWorkspaceCode = async () => {
        if (!workspaceCode || !workspaceConfirm)
            return { ok: false, msg: "Enter code and confirmation" };
        if (workspaceCode !== workspaceConfirm)
            return { ok: false, msg: "Codes do not match" };

        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) return { ok: false, msg: "User not signed-in" };

        const hash = await bcrypt.hash(workspaceCode, 10);

        // Fetch existing private_code (if any)
        const { data: existing } = await supabase
            .from("vault_codes")
            .select("private_code")
            .eq("id", user.id)
            .single();

        const { error } = await supabase.from("vault_codes").upsert(
            {
            id: user.id,
            workspace_code: hash,
            private_code: existing?.private_code ?? null, // keep other
            },
            { onConflict: "id" }
        );

        if (error) return { ok: false, msg: "Failed to save code" };

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

        const {
            data: { user },
        } = await supabase.auth.getUser();

        const { data, error } = await supabase
            .from("vault_codes")
            .select("workspace_code")
            .eq("id", user.id)
            .single();

        if (error || !data)
            return { ok: false, msg: "Unable to load existing code" };

        const storedHash = data.workspace_code;
        const match = await bcrypt.compare(workspaceCurrent, storedHash);
        if (!match) return { ok: false, msg: "Current code is incorrect ❌" };

        const newHash = await bcrypt.hash(workspaceCode, 10);

        const { error: updateErr } = await supabase
            .from("vault_codes")
            .update({ workspace_code: newHash })
            .eq("id", user.id);

        if (updateErr) return { ok: false, msg: "Update failed" };

        return { ok: true, msg: "Workspace code updated successfully ✅" };
        };

        /* ────────────── CREATE PRIVATE CODE ────────────── */
        const createPrivateCode = async () => {
        if (!privateCode || !privateConfirm)
            return { ok: false, msg: "Enter code and confirmation" };
        if (privateCode !== privateConfirm)
            return { ok: false, msg: "Codes do not match" };

        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) return { ok: false, msg: "User not signed-in" };

        const hash = await bcrypt.hash(privateCode, 10);

        // Fetch existing workspace_code (if any)
        const { data: existing } = await supabase
            .from("vault_codes")
            .select("workspace_code")
            .eq("id", user.id)
            .single();

        const { error } = await supabase.from("vault_codes").upsert(
            {
            id: user.id,
            private_code: hash,
            workspace_code: existing?.workspace_code ?? null,
            },
            { onConflict: "id" }
        );

        if (error) return { ok: false, msg: "Failed to save code" };

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

        const {
            data: { user },
        } = await supabase.auth.getUser();

        const { data, error } = await supabase
            .from("vault_codes")
            .select("private_code")
            .eq("id", user.id)
            .single();

        if (error || !data)
            return { ok: false, msg: "Unable to load existing code" };

        const storedHash = data.private_code;
        const match = await bcrypt.compare(privateCurrent, storedHash);
        if (!match) return { ok: false, msg: "Current code is incorrect ❌" };

        const newHash = await bcrypt.hash(privateCode, 10);

        const { error: updateErr } = await supabase
            .from("vault_codes")
            .update({ private_code: newHash })
            .eq("id", user.id);

        if (updateErr) return { ok: false, msg: "Update failed" };

        return { ok: true, msg: "Private code updated successfully ✅" };
    };



    /* ────────────────── UI ────────────────── */
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
                <button
                    onClick={saveBasicInfo}
                    className="btn-secondary text-sm"
                >
                    Save basic info
                </button>

                {basicSaved && (
                    <p className="text-xs text-green-600 mt-1">Profile saved successfully!</p>
                )}
                </div>
            </div>

            {/* Password */}
            <div className="text-gray-800">
                <h2 className="text-lg font-semibold mb-4">Change password</h2>
                <div className="space-y-3">
                {/* Current password */}
                <input
                    type="password"
                    value={currentPw}
                    onChange={(e) => {
                        const val = e.target.value;
                        setCurrentPw(val);

                        clearTimeout(currPwTimer.current);

                        if (val.length < 6) {
                        setCurrPwStatus("");          // reset if too short
                        return;
                        }

                        setCurrPwStatus("checking");    // show gray “Checking…”

                        // ⏳ wait 3 seconds, then check
                        currPwTimer.current = setTimeout(async () => {
                        const {
                            data: { session },
                        } = await supabase.auth.getSession();

                        const email = session?.user?.email;
                        if (!email) return setCurrPwStatus("bad");

                        const { error } = await supabase.auth.signInWithPassword({
                            email,
                            password: val,
                        });

                        setCurrPwStatus(error ? "bad" : "good"); // stays until next keystroke
                        }, 1000);
                    }}
                    placeholder="Current password"
                    className="w-full border rounded px-3 py-2 text-sm"
                />
                {/* ▼ dynamic helper notes */}
                {currPwStatus === "checking" && (
                <p className="text-xs text-gray-500 -mt-1">Checking…</p>
                )}
                {currPwStatus === "good" && (
                <p className="text-xs text-green-600 -mt-1">Current password correct ✅</p>
                )}
                {currPwStatus === "bad" && (
                <p className="text-xs text-red-500 -mt-1">Current password incorrect</p>
                )}

                {/* New password */}
                <input
                    type="password"
                    value={newPw}
                    onChange={(e) => {
                        const v = e.target.value;
                        setNewPw(v);

                        clearTimeout(matchTimer);
                        setPwMatchNote("checking");        // optional “Checking…”

                        matchTimer = setTimeout(() => {
                        setPwMatchNote(
                            confirmPw ? (v === confirmPw ? "match" : "no-match") : ""
                        );
                        }, 3000);
                    }}
                    placeholder="New password"
                    className="w-full border rounded px-3 py-2 text-sm"
                    />

                    {/* Confirm password */}
                    <input
                    type="password"
                    value={confirmPw}
                    onChange={(e) => {
                        const v = e.target.value;
                        setConfirmPw(v);

                        clearTimeout(matchTimer);
                        setPwMatchNote("checking");

                        matchTimer = setTimeout(() => {
                        setPwMatchNote(v && v === newPw ? "match" : "no-match");
                        }, 3000);
                    }}
                    placeholder="Confirm new password"
                    className="w-full border rounded px-3 py-2 text-sm"
                />
                {/* ▼ dynamic helper notes */}
                {pwMatchNote === "match" && (
                <p className="text-xs text-green-600 -mt-1">Passwords match ✅</p>
                )}
                {pwMatchNote === "no-match" && (
                <p className="text-xs text-red-500 -mt-1">Passwords do not match</p>
                )}

                {/* ▼ password rules */}
                {pwErr && <p className="text-xs text-red-500 -mt-1">{pwErr}</p>}
                <ul className="text-xs text-gray-500 pl-4 list-disc space-y-0.5">
                    <li>One lowercase character</li>
                    <li>One uppercase character</li>
                    <li>One number</li>
                    <li>One special character</li>
                    <li>8 characters minimum</li>
                </ul>
                <button
                    onClick={changePassword}
                    className="btn-secondary text-sm"
                >
                    Update password
                </button>

                {pwdSaved && (
                    <p className="text-xs text-green-600 mt-1">Password updated successfully!</p>
                )}
                </div>
            </div>
            </div>

            {/* ========== Vault Codes ========== */}
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


            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Workspace Card */}
            <div className="p-5 bg-gray-50 rounded border">

                {codes.workspace === null ? (
                /* CREATE form */
                <>
                <h3 className="font-medium mb-3 text-gray-900">Create a new <strong>Private</strong> vault code</h3>
                    <input
                    type="password"
                    placeholder="Create workspace code"
                    value={workspaceCode}
                    onChange={(e) => setWorkspaceCode(e.target.value)}
                    className="w-full border rounded px-3 py-2 text-sm mb-2 text-gray-800"
                    />
                    <input
                    type="password"
                    placeholder="Confirm code"
                    value={workspaceConfirm}
                    onChange={(e) => setWorkspaceConfirm(e.target.value)}
                    className="w-full border rounded px-3 py-2 text-sm mb-3 text-gray-800"
                    />
                    <button
                    className="btn-secondary text-sm"
                    onClick={async () => {
                        const { ok, msg } = await createWorkspaceCode();
                        setWorkspaceMsg({ ok, msg });
                    }}
                    >
                    Create code
                    </button>
                    {workspaceMsg?.ok ? (
                    <p className="text-xs text-green-600 mt-1">{workspaceMsg.msg}</p>
                    ) : workspaceMsg?.msg ? (
                    <p className="text-xs text-red-500 mt-1">{workspaceMsg.msg}</p>
                    ) : null}
                </>
                ) : (
                /* CHANGE form */
                <>
                <h3 className="font-medium mb-3 text-gray-900">Change your <strong>Private</strong> vault code</h3>
                    <input
                    type="password"
                    placeholder="Current workspace vault code"
                    value={workspaceCurrent}
                    onChange={(e) => setWorkspaceCurrent(e.target.value)}
                    className="w-full border rounded px-3 py-2 text-sm mb-2 text-gray-800"
                    />
                    <input
                    type="password"
                    placeholder="New code"
                    value={workspaceCode}
                    onChange={(e) => setWorkspaceCode(e.target.value)}
                    className="w-full border rounded px-3 py-2 text-sm mb-2 text-gray-800"
                    />
                    <input
                    type="password"
                    placeholder="Confirm new code"
                    value={workspaceConfirm}
                    onChange={(e) => setWorkspaceConfirm(e.target.value)}
                    className="w-full border rounded px-3 py-2 text-sm mb-3 text-gray-800"
                    />
                    <button
                    className="btn-secondary text-sm"
                    onClick={async () => {
                        const { ok, msg } = await changeWorkspaceCode();
                        setWorkspaceMsg({ ok, msg });
                    }}
                    >
                    Change code
                    </button>
                    {workspaceMsg?.ok ? (
                    <p className="text-xs text-green-600 mt-1">{workspaceMsg.msg}</p>
                    ) : workspaceMsg?.msg ? (
                    <p className="text-xs text-red-500 mt-1">{workspaceMsg.msg}</p>
                    ) : null}
                </>
                )}
            </div>

            {/* Private Card */}
            <div className="p-5 bg-gray-50 rounded border">

                {codes.private === null ? (
                /* CREATE */
                <>
                <h3 className="font-medium mb-3 text-gray-900">Create a new <strong>Private</strong> vault code</h3>
                    <input
                    type="password"
                    placeholder="Create private code"
                    value={privateCode}
                    onChange={(e) => setPrivateCode(e.target.value)}
                    className="w-full border rounded px-3 py-2 text-sm mb-2 text-gray-800"
                    />
                    <input
                    type="password"
                    placeholder="Confirm code"
                    value={privateConfirm}
                    onChange={(e) => setPrivateConfirm(e.target.value)}
                    className="w-full border rounded px-3 py-2 text-sm mb-3 text-gray-800"
                    />
                    <button
                    className="btn-secondary text-sm"
                    onClick={async () => {
                        const { ok, msg } = await createPrivateCode();
                        setPrivateMsg({ ok, msg });
                    }}
                    >
                    Create code
                    </button>
                    {privateMsg?.ok ? (
                    <p className="text-xs text-green-600 mt-1">{privateMsg.msg}</p>
                    ) : privateMsg?.msg ? (
                    <p className="text-xs text-red-500 mt-1">{privateMsg.msg}</p>
                    ) : null}
                </>
                ) : (
                /* CHANGE */
                <>
                <h3 className="font-medium mb-3 text-gray-900">Change your <strong>Private</strong> vault code</h3>
                    <input
                    type="password"
                    placeholder="Current private vault code"
                    value={privateCurrent}
                    onChange={(e) => setPrivateCurrent(e.target.value)}
                    className="w-full border rounded px-3 py-2 text-sm mb-2 text-gray-800"
                    />
                    <input
                    type="password"
                    placeholder="New code"
                    value={privateCode}
                    onChange={(e) => setPrivateCode(e.target.value)}
                    className="w-full border rounded px-3 py-2 text-sm mb-2 text-gray-800"
                    />
                    <input
                    type="password"
                    placeholder="Confirm new code"
                    value={privateConfirm}
                    onChange={(e) => setPrivateConfirm(e.target.value)}
                    className="w-full border rounded px-3 py-2 text-sm mb-3 text-gray-800"
                    />
                    <button
                    className="btn-secondary text-sm"
                    onClick={async () => {
                        const { ok, msg } = await changePrivateCode();
                        setPrivateMsg({ ok, msg });
                    }}
                    >
                    Change code
                    </button>
                    {privateMsg?.ok ? (
                    <p className="text-xs text-green-600 mt-1">{privateMsg.msg}</p>
                    ) : privateMsg?.msg ? (
                    <p className="text-xs text-red-500 mt-1">{privateMsg.msg}</p>
                    ) : null}
                </>
                )}
            </div>
            </div>
        </div>
        </Layout>
    );
}
