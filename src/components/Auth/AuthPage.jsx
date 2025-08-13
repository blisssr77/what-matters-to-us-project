import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { generateSeedPhrase } from "../../utils/generateSeedPhrase";
import { useNavigate } from "react-router-dom";
import { useWorkspaceStore } from "../../hooks/useWorkspaceStore";

export default function AuthPage() {
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [confirmationEmailSent, setConfirmationEmailSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showPassword2, setShowPassword2] = useState(false);

  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  // Handle form submission for login or signup
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { email, password } = formData;

    if (!isLogin && password !== confirmPassword) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    try {
      // Sign In or Sign Up
      const authResult = isLogin
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

      if (authResult.error) throw authResult.error;

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError("Authentication failed.");
        return;
      }

      const userId = user.id;

      if (!isLogin) {
        // Create profile only during sign-up
        await supabase.from("profiles").insert({
          created_at: new Date().toISOString(),
          id: userId,
          email,
          username: email.split("@")[0],
        });

        // Show confirmation message
        setConfirmationEmailSent(true);
        setIsLogin(true);
        return;
      }

      // === Workspace creation happens only if none exist ===

      // 1. Check if user already has any workspaces
      const { data: workspaces, error: workspaceFetchError } = await supabase
        .from("workspaces")
        .select("*")
        .eq("created_by", userId)
        .limit(1); // Only check for existence

      if (workspaceFetchError) {
        console.error("❌ Error fetching workspaces:", workspaceFetchError);
        setError("Failed to fetch workspace.");
        return;
      }

      let workspaceData;

      // 2. If none found, create a new one
      if (!workspaces || workspaces.length === 0) {
        const { data: workspaceArr, error: workspaceError } = await supabase
          .from("workspaces")
          .insert({ name: "My First Workspace", created_by: userId, role: "owner" })
          .select();

        if (workspaceError || !workspaceArr?.[0]) {
          console.error("❌ Workspace creation failed:", workspaceError);
          setError("Failed to create workspace.");
          return;
        }

        workspaceData = workspaceArr[0];
      } else {
        workspaceData = workspaces[0];
      }

      // 3. Check if the user is already a member of any workspace
      const { data: memberships, error: memberFetchError } = await supabase
        .from("workspace_members")
        .select("id")
        .eq("user_id", userId)
        .limit(1);

      if (memberFetchError) {
        console.error("❌ Error checking membership:", memberFetchError);
      }

      // 4. Insert membership only if none exist
      if (!memberships || memberships.length === 0) {
        const { error: insertError } = await supabase
          .from("workspace_members")
          .insert({
            user_id: userId,
            workspace_id: workspaceData.id,
            role: "owner",
            is_admin: true,
          });

        if (insertError) {
          console.error("❌ Insert error:", insertError);
          setError("Failed to create workspace membership.");
          return;
        }

        console.log("✅ Workspace member inserted successfully.");
      } else {
        console.log("⚠️ User already a member of a workspace, skipping insert.");
      }


      // Navigate to dashboard
      navigate("/dashboard");
    } catch (err) {
      console.error("❌ Auth error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle Google login
  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
    if (error) setError(error.message);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 border border-gray-100">
        <h2 className="text-2xl font-bold text-center mb-4 text-gray-800">
          {isLogin ? "Welcome Back" : "Create an Account"}
        </h2>

        {confirmationEmailSent && (
          <div className="text-green-600 text-sm text-center mb-4">
            📧 Confirmation email sent to {formData.email}. Please check your inbox.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            name="email"
            type="email"
            placeholder="Email"
            value={formData.email}
            onChange={handleChange}
            className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-gray-50 text-gray-700 focus:outline-none focus:ring-0 focus:ring-gray-500"
            required
          />

          <div className="relative">
            <input
              name="password"
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={formData.password}
              onChange={handleChange}
              className="w-full px-4 py-3 pr-10 rounded-lg border border-gray-300 bg-gray-50 text-gray-700 focus:outline-none focus:ring-0 focus:ring-gray-500"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500"
            >
              {showPassword ? "🙈" : "👁️"}
            </button>
          </div>

          {!isLogin && (
            <div className="relative">
            <input
              name="confirmPassword"
              type={showPassword2 ? "text" : "password"}
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-gray-50 text-gray-700 focus:outline-none focus:ring-0 focus:ring-gray-500"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword2((prev) => !prev)}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500"
            >
              {showPassword2 ? "🙈" : "👁️"}
            </button>
            </div>

            
          )}

          {error && <div className="text-sm text-red-500 text-center">{error}</div>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-purple-600 text-white py-3 rounded-lg hover:bg-purple-700 transition duration-200"
          >
            {loading ? "Loading..." : isLogin ? "Log In" : "Sign Up"}
          </button>
        </form>

        <div className="mt-4 text-center text-sm text-gray-600">
          {isLogin ? (
            <>
              Don't have an account?{" "}
              <button
                className="text-purple-600 hover:underline"
                onClick={() => setIsLogin(false)}
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                className="text-purple-600 hover:underline"
                onClick={() => setIsLogin(true)}
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
          className="w-full flex items-center justify-center gap-2 border border-gray-300 py-3 rounded-lg hover:bg-gray-100 transition"
        >
          <img
            src="https://www.svgrepo.com/show/475656/google-color.svg"
            alt="Google"
            className="w-5 h-5"
          />
          <span className="text-gray-700">Google</span>
        </button>
      </div>
    </div>
  );
}
