import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { generateSeedPhrase } from "../../utils/generateSeedPhrase";
import { useNavigate } from "react-router-dom";

export default function AuthPage() {
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [confirmationEmailSent, setConfirmationEmailSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

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
      const { data, error } = isLogin
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

      if (error) throw error;

      if (isLogin) {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          const { data: existing } = await supabase
            .from("user_seeds")
            .select("*")
            .eq("id", user.id)
            .single();

          if (!existing) {
            const seedWords = generateSeedPhrase();
            await supabase.from("user_seeds").insert({
              id: user.id,
              seed_words: seedWords,
            });

            alert(`Your seed phrase: ${seedWords.join(" ")}`);
          }

          navigate("/dashboard");
        } else {
          setError("Login failed. Please check your credentials.");
        }
      } else {
        setConfirmationEmailSent(true);
        setIsLogin(true); // Switch to login screen
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
    });
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
            className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-500"
            required
          />

          <div className="relative">
            <input
              name="password"
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={formData.password}
              onChange={handleChange}
              className="w-full px-4 py-3 pr-10 rounded-lg border border-gray-300 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-500"
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
            <input
              name="confirmPassword"
              type="password"
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-500"
              required
            />
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
