import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabaseClient";
import { generateSeedPhrase } from "../../utils/generateSeedPhrase";
import { useNavigate } from "react-router-dom";

// Ensure a profile row exists and keep email/verification in sync with the auth user.
async function ensureProfile(user) {
  if (!user?.id) return;
  const uid = user.id;

  // derive what we want to persist
  const patchFromAuth = {
    email: user.email ?? null,
    // mark verified if auth knows it is confirmed
    ...(user.email_confirmed_at ? { email_verified: true } : {}),
  };

  // does a row exist?
  const { data: existing, error: selErr, status } = await supabase
    .from('profiles')
    .select('id, email_verified')
    .eq('id', uid)
    .maybeSingle();

  if (selErr && status !== 406) throw selErr;

  if (existing?.id) {
    // update lightweight fields every time we sign in (keeps email + verified fresh)
    const { error: updErr } = await supabase
      .from('profiles')
      .update({
        ...patchFromAuth,
        updated_at: new Date().toISOString(),
      })
      .eq('id', uid);
    if (updErr) throw updErr;
    return;
  }

  // insert on first sign-in after verification (or first password login)
  const insertRow = {
    id: uid,
    username: (user.email?.split('@')[0]) || `user-${uid.slice(0, 8)}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    email_verified: !!user.email_confirmed_at,   // true if they arrived via verified link
    ...patchFromAuth,
    vault_code_set: false,                       // keep your defaults
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
        return; // do NOT render the auth form
      }
      setBooted(true); // safe to render form
    })();
  }, [navigate]);

  // On mount: if already signed in, go to dashboard.
  // Also subscribe to real transitions and navigate on SIGNED_IN.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(async (evt, session) => {
      if (evt === "SIGNED_IN" && session?.user) {
        try {
          await ensureProfile(user, {
            vault_code_set: false,
            seed_phrase: generateSeedPhrase(),
            // no created_at here (insert path handles it)
          });
        } catch {}
        navigate("/dashboard", { replace: true });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  // Submit handler for login/signup
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
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        // ensure profile; navigate (also handled by onAuthStateChange)
        try {
          await ensureProfile(data.user, {
            created_at: new Date().toISOString(),
            vault_code_set: false,
            seed_phrase: generateSeedPhrase(),
          });
        } catch {}
        navigate("/dashboard", { replace: true });
        return;
      }

      // --- SIGN UP ---
      // hard sign-out first (leftover sessions are the #1 cause of “stuck”)
      try { await supabase.auth.signOut(); } catch {}

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/dashboard` },
      });
      if (error) throw error;

      // No session yet — show banner & switch to login
      setConfirmationEmailSent(true);
      setIsLogin(true);
    } catch (err) {
      console.error("Auth error:", err);
      setError(err.message || "Authentication error");
    } finally {
      setLoading(false);   // ← always clears the “Loading…” button
    }
  };

  // Google OAuth → redirect straight to /dashboard after provider flow
  const handleGoogleLogin = async () => {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
    if (error) setError(error.message);
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-50 via-white to-white flex items-center justify-center px-4">
      {!booted ? (
        <div className="text-sm text-gray-600">Loading…</div>
      ) : (
        <div className="w-full max-w-md">
          {/* Brand / heading */}
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-500 via-indigo-200 to-blue-500 bg-clip-text text-transparent animate-pulse-slow">
              WhatMatters
            </h1>
            <p className="mt-1 text-xs text-gray-500">
              Focus your notes, docs, and tasks—securely.
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

                {confirmationEmailSent && (
                  <div className="text-emerald-600 text-sm text-center">
                    📧 Verification email sent to {formData.email}. Use the link to log in.
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
            </div>
          </div>

          {/* tiny footer */}
          <p className="text-[11px] text-center text-gray-400 mt-4">
            © {new Date().getFullYear()} WhatMatters
          </p>
        </div>
      )}
    </div>
  );
}
