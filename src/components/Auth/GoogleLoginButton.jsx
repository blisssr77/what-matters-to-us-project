import { supabase } from '../../lib/supabaseClient';

export default function GoogleLoginButton() {
  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
    });
  };

  return (
    <button
      onClick={handleGoogleLogin}
      className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
    >
      Continue with Google
    </button>
  );
}