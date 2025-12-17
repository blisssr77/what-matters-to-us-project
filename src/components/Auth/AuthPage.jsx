import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabaseClient";
import { generateSeedPhrase } from "../../utils/generateSeedPhrase";
import { useNavigate } from "react-router-dom";
import { User, ShieldCheck } from "lucide-react"; // Optional: Icons for the button

// Ensure a profile row exists. Updated to handle Anonymous (Guest) users.
async function ensureProfile(user) {
  if (!user?.id) return;
  const uid = user.id;

  // GUEST HANDLING: Anonymous users have no email.
  const email = user.email || null;
  const isAnon = user.is_anonymous;

  const patchFromAuth = {
    email: email,
    // Only set verified if we actually have a confirmed email
    ...(user.email_confirmed_at ? { email_verified: true } : {}),
  };

  // 1. Check if profile exists
  const { data: existing, error: selErr, status } = await supabase
    .from('profiles')
    .select('id, email_verified')
    .eq('id', uid)
    .maybeSingle();
  if (selErr && status !== 406) throw selErr;

  // 2. Update existing
  if (existing?.id) {
    const { error: updErr } = await supabase
      .from('profiles')
      .update({ ...patchFromAuth, updated_at: new Date().toISOString() })
      .eq('id', uid);
    if (updErr) throw updErr;
    return;
  }

  // 3. Create new (Handle Guest Username)
  const insertRow = {
    id: uid,
    // If no email, generate a 'guest-xxxxx' username
    username: email 
      ? email.split('@')[0] 
      : `guest-${uid.slice(0, 8)}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    email_verified: !!user.email_confirmed_at,
    ...patchFromAuth,
    vault_code_set: false,
  };

  const { error: insErr } = await supabase.from('profiles').insert(insertRow);
  if (insErr) throw insErr;
}

export default function AuthPage() {
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [confirmationEmailSent, setConfirmationEmailSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showPassword2, setShowPassword2] = useState(false);
  const [booted, setBooted] = useState(false);

  const navigate = useNavigate();

  const handleChange = (e) =>
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  // On initial mount: check if already signed in
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        try { await ensureProfile(session.user); } catch {}
        navigate('/dashboard', { replace: true });
        return; 
      }
      setBooted(true); 
    })();
  }, [navigate]);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(async (evt, session) => {
      if (evt === "SIGNED_IN" && session?.user) {
        try { await ensureProfile(session.user); } catch {}
        navigate("/dashboard", { replace: true });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  // --- HANDLERS ---

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { email, password } = formData;

    try {
      if (!isLogin && password !== confirmPassword) {
        throw new Error("Passwords do not match");
      }

      if (isLogin) {
        // LOGIN
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          const msg = (error.message || "").toLowerCase();
          if (msg.includes("email not confirmed")) {
            setError("Please confirm your email before logging in.");
          } else if (msg.includes("invalid login credentials")) {
            setError("Invalid email or password.");
          } else {
            setError(error.message);
          }
          return;
        }
        try { await ensureProfile(data.user); } catch {}
        navigate("/dashboard", { replace: true });
        return;
      }

      // SIGN UP
      try { await supabase.auth.signOut({ scope: "global" }); } catch {}

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/dashboard` },
      });

      if (error) {
        const emsg = (error.message || "").toLowerCase();
        if (emsg.includes("already") || emsg.includes("exists") || error.code === "email_exists" || error.status === 400) {
          setError('This email is already registered. Use "Log in" or "Continue with Google".');
          setIsLogin(true);
          return;
        }
        setError(error.message);
        return;
      }

      const alreadyExists = data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0;
      if (alreadyExists) {
        setError('This email is already registered. Use "Log in" or "Continue with Google".');
        setIsLogin(true);
        return;
      }

      if (!data?.session) {
        setConfirmationEmailSent(true);
        setIsLogin(true);
        return;
      }

      try { await ensureProfile(data.user); } catch {}
      navigate("/dashboard", { replace: true });
    } catch (err) {
      console.error("Auth error:", err);
      setConfirmationEmailSent(false);
      setError(err.message || "Authentication error");
    } finally {
      setLoading(false);
    }
  };

  async function sendMagicLink() {
    setError(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: formData.email,
        options: { emailRedirectTo: `${window.location.origin}/dashboard` },
      });
      if (error) throw error;
      setConfirmationEmailSent(true);
      setIsLogin(true);
    } catch (e) {
      setError(e.message || "Failed to send magic link");
    } finally {
      setLoading(false);
    }
  }

  const handleGoogleLogin = async () => {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
    if (error) setError(error.message);
  };

  // --- NEW: GUEST LOGIN ---
  const handleGuestLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      // 1. Sign in anonymously
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) throw error;

      // 2. Ensure profile exists (will create 'guest-xxxx' username)
      if (data?.user) {
        await ensureProfile(data.user);
      }
      
      // 3. Navigate
      navigate("/dashboard", { replace: true });
    } catch (err) {
      console.error("Guest login error:", err);
      setError(err.message || "Guest login failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-50 via-white to-white flex items-center justify-center px-4">
      {!booted ? (
        <div className="text-sm text-gray-600">Loading…</div>
      ) : (
        <div className="w-full max-w-md">
          {/* Brand */}
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-500 via-indigo-200 to-blue-500 bg-clip-text text-transparent animate-pulse-slow">
              WhatMatters
            </h1>
            <p className="mt-1 text-xs text-gray-500">
              Focus on your notes, docs, and tasks—securely.
            </p>
          </div>

          {/* Card */}
          <div className="bg-white/90 backdrop-blur rounded-2xl shadow-xl ring-1 ring-gray-900/5 border border-gray-100">
            <div className="p-6 sm:p-8">
              <h2 className="text-xl font-semibold text-center mb-4 text-gray-900">
                {isLogin ? "Welcome back" : "Create an account"}
              </h2>

              <form onSubmit={handleSubmit} className="space-y-4">
                <input
                  name="email"
                  type="email"
                  placeholder="Email"
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full px-3.5 py-3 rounded-lg border border-gray-300 bg-gray-50 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  required
                />

                <div className="relative">
                  <input
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Password"
                    value={formData.password}
                    onChange={handleChange}
                    className="w-full px-3.5 py-3 pr-10 rounded-lg border border-gray-300 bg-gray-50 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
                  >
                    {showPassword ? "🙈" : "👁️"}
                  </button>
                </div>

                {!isLogin && (
                  <div className="relative">
                    <input
                      name="confirmPassword"
                      type={showPassword2 ? "text" : "password"}
                      placeholder="Confirm password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full px-3.5 py-3 pr-10 rounded-lg border border-gray-300 bg-gray-50 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword2((p) => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
                    >
                      {showPassword2 ? "🙈" : "👁️"}
                    </button>
                  </div>
                )}

                {confirmationEmailSent && !error && (
                  <div className="text-emerald-600 text-sm text-center">
                    📧 Verification email sent to {formData.email}.
                  </div>
                )}

                {error && (
                  <div className="text-sm text-red-500 text-center">{error}</div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white py-3 rounded-lg hover:from-purple-700 hover:to-indigo-700 transition disabled:opacity-60"
                >
                  {loading ? "Loading..." : isLogin ? "Log In" : "Sign Up"}
                </button>
              </form>

              <div className="mt-4 text-center text-sm text-gray-600">
                {isLogin ? (
                  <>
                    Don&apos;t have an account?{" "}
                    <button
                      className="text-purple-600 hover:underline"
                      onClick={async () => {
                        setError(null);
                        setConfirmationEmailSent(false);
                        setIsLogin(false);
                        try { await supabase.auth.signOut(); } catch {}
                      }}
                    >
                      Sign up
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{" "}
                    <button
                      className="text-purple-600 hover:underline"
                      onClick={() => {
                        setError(null);
                        setConfirmationEmailSent(false);
                        setIsLogin(true);
                      }}
                    >
                      Log in
                    </button>
                  </>
                )}
              </div>

              <div className="my-6 border-t text-center text-sm text-gray-400 pt-4">
                or continue with
              </div>

              {/* Social Login Stack */}
              <div className="space-y-3">
                <button
                  onClick={handleGoogleLogin}
                  className="w-full flex items-center justify-center gap-2 border border-gray-300 py-3 rounded-lg hover:bg-gray-50 transition"
                >
                  <img
                    src="https://www.svgrepo.com/show/475656/google-color.svg"
                    alt="Google"
                    className="w-5 h-5"
                  />
                  <span className="text-gray-800">Google</span>
                </button>

                {/* --- MODERN GUEST LOGIN BUTTON --- */}
                <button
                  onClick={handleGuestLogin}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 border border-gray-300 py-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition text-gray-600 group"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="w-5 h-5 text-gray-500 group-hover:text-gray-700"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                    />
                  </svg>
                  <span>Continue as Guest</span>
                </button>
              </div>

              {/* Magic Link Fallback */}
              {error?.toLowerCase()?.includes('already') && (
                <div className="mt-4 text-center">
                  <button
                    type="button"
                    onClick={sendMagicLink}
                    disabled={loading || !formData.email}
                    className="text-sm text-indigo-600 hover:underline disabled:opacity-60"
                  >
                    Send me a magic link instead
                  </button>
                </div>
              )}

            </div>
          </div>

          <p className="text-[11px] text-center text-gray-400 mt-4">
            © {new Date().getFullYear()} WhatMatters
          </p>
        </div>
      )}
    </div>
  );
}
