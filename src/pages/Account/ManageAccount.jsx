import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import Layout from "../../components/Layout/Layout";
import { UploadCloud, Camera } from "lucide-react";

/* =========================================================
   ManageAccount.jsx – modern AI‑styled settings page
   ========================================================= */
export default function ManageAccount() {
    /* ────────────────── Profile / Basic Info state ────────────────── */
    const [avatar, setAvatar] = useState(null);
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [username, setUsername] = useState("");
    const [usernameErr, setUsernameErr] = useState("");
    const [basicSaved, setBasicSaved] = useState(false);
    const [pwdSaved, setPwdSaved] = useState(false);

    /* ────────────────── Password state ────────────────── */
    const [currentPw, setCurrentPw] = useState("");
    const [newPw, setNewPw] = useState("");
    const [confirmPw, setConfirmPw] = useState("");
    const [pwErr, setPwErr] = useState("");
    const [pwMatchNote, setPwMatchNote] = useState(""); // "" | "match" | "no-match"
    const [currPwStatus, setCurrPwStatus] = useState(""); // "" | "correct" | "incorrect"


    /* ────────────────── Vault Codes state ────────────────── */
    const [workspaceCode, setWorkspaceCode] = useState("");
    const [privateCode, setPrivateCode] = useState("");

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

    /* ────────────────── Checking if Current Password is Correct ────────────────── */
    let currPwTimer;   // module-level or ref

    const checkCurrentPw = (pw) => {
        clearTimeout(currPwTimer);
        setCurrPwStatus("checking");
        currPwTimer = setTimeout(async () => {
            const {
            data: { session },
            } = await supabase.auth.getSession();
            const email = session?.user?.email;

            if (!email) return setCurrPwStatus("bad");

            const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
            setCurrPwStatus(error ? "bad" : "good");
        }, 400);
    };

    /* ────────────────── Save handlers (wire to Supabase) ────────────────── */
    const saveBasicInfo = async () => {
        if (usernameErr) return;

        const {
            data: { user },
        } = await supabase.auth.getUser();

        // Upsert and get back the row in one call
        const { data, error } = await supabase
            .from("profiles")
            .upsert(
            {
                id: user.id,
                first_name: firstName,
                last_name: lastName,
                username,
            },
            { onConflict: "id", returning: "representation" }
            )
            .single();

        if (!error && data) {
            // keep local state in sync with saved values
            setFirstName(data.first_name);
            setLastName(data.last_name);
            setUsername(data.username);
            setBasicSaved(true);
            setTimeout(() => setBasicSaved(false), 10000);
        }
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

    const saveWorkspaceCode = async () => {
        const {
        data: { user },
        } = await supabase.auth.getUser();
        await supabase.from("vault_codes").upsert({ id: user.id, workspace_code: workspaceCode });
    };

    const savePrivateCode = async () => {
        const {
        data: { user },
        } = await supabase.auth.getUser();
        await supabase.from("vault_codes").upsert({ id: user.id, private_code: privateCode });
    };

    /* ────────────────── UI ────────────────── */
    return (
        <Layout>
        <div className="max-w-4xl mx-auto bg-white/95 backdrop-blur p-8 rounded-xl shadow-lg">
            <h1 className="text-2xl font-bold text-gray-800 mb-8">Manage Account</h1>

            {/* ========== Profile Photo ========== */}
            <div className="mb-12">
            <h2 className="text-lg font-semibold mb-4">Profile photo</h2>
            <div className="flex items-start gap-4">
                <div className="w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center text-3xl font-bold text-purple-600 overflow-hidden">
                {avatar ? <img src={URL.createObjectURL(avatar)} className="object-cover w-full h-full" /> : "R"}
                </div>
                <div>
                <p className="text-sm text-gray-600">Upload your photo …</p>
                <p className="text-xs text-gray-400 mb-2">Photo should be at least 300 × 300 px</p>
                <div className="flex gap-2">
                    <label className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border rounded cursor-pointer hover:bg-purple-50">
                    <UploadCloud size={14} /> Upload
                    <input type="file" className="hidden" onChange={(e) => setAvatar(e.target.files[0])} />
                    </label>
                    <button className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border rounded hover:bg-purple-50">
                    <Camera size={14} /> Take Photo
                    </button>
                </div>
                </div>
            </div>
            </div>

            {/* ========== Basic Info & Password (stacked) ========== */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 mb-12">
            {/* Basic */}
            <div>
                <h2 className="text-lg font-semibold mb-4">Basic information</h2>
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
                    className="bg-purple-600 text-white px-5 py-2 rounded hover:bg-purple-700 transition text-sm"
                >
                    Save basic info
                </button>

                {basicSaved && (
                    <p className="text-xs text-green-600 mt-1">Profile saved successfully ✅</p>
                )}
                </div>
            </div>

            {/* Password */}
            <div>
                <h2 className="text-lg font-semibold mb-4">Change password</h2>
                <div className="space-y-3">
                {/* Current password */}
                <input
                    type="password"
                    value={currentPw}
                    onChange={(e) => {
                        const val = e.target.value;
                        setCurrentPw(val);

                        clearTimeout(currPwTimer);

                        if (val.length < 6) {
                        setCurrPwStatus("");          // reset if too short
                        return;
                        }

                        setCurrPwStatus("checking");    // show gray “Checking…”

                        // ⏳ wait 3 seconds, then check
                        currPwTimer = setTimeout(async () => {
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
                        }, 3000);
                    }}
                    placeholder="Current password"
                    className="w-full border rounded px-3 py-2 text-sm"
                />
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
                {currPwStatus === "checking" && (
                <p className="text-xs text-gray-500 -mt-1">Checking…</p>
                )}
                {currPwStatus === "good" && (
                <p className="text-xs text-green-600 -mt-1">Current password correct ✅</p>
                )}
                {currPwStatus === "bad" && (
                <p className="text-xs text-red-500 -mt-1">Current password incorrect</p>
                )}

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
                    className="bg-purple-600 text-white px-5 py-2 rounded hover:bg-purple-700 transition text-sm"
                >
                    Update password
                </button>

                {pwdSaved && (
                    <p className="text-xs text-green-600 mt-1">Password updated successfully ✅</p>
                )}
                </div>
            </div>
            </div>

            {/* Vault codes section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8">
            {/* Workspace vault */}
            <div className="p-5 bg-gray-50 rounded border">
                <h3 className="font-medium mb-3 text-gray-700">Workspace Vault Code</h3>
                <input type="password" value={workspaceCode} onChange={(e)=>setWorkspaceCode(e.target.value)} className="w-full border rounded px-3 py-2 text-sm mb-3" placeholder="Enter workspace code" />
                <button onClick={saveWorkspaceCode} className="bg-purple-600 text-white px-4 py-1.5 rounded hover:bg-purple-700 transition text-sm">Save workspace code</button>
            </div>

            {/* Private vault */}
            <div className="p-5 bg-gray-50 rounded border">
                <h3 className="font-medium mb-3 text-gray-700">Private Vault Code</h3>
                <input type="password" value={privateCode} onChange={(e)=>setPrivateCode(e.target.value)} className="w-full border rounded px-3 py-2 text-sm mb-3" placeholder="Enter private code" />
                <button onClick={savePrivateCode} className="bg-purple-600 text-white px-4 py-1.5 rounded hover:bg-purple-700 transition text-sm">Save private code</button>
            </div>
            </div>
        </div>
        </Layout>
    );
}
