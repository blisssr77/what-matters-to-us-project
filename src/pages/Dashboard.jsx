import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const checkSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        navigate("/");
      } else {
        setLoading(false);
      }
    };

    checkSession();
  }, [navigate]);

  if (loading) return <div className="text-center mt-10">Loading Dashboard...</div>;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-800">🚀 Dashboard</h1>
      <p className="text-gray-600 mt-2">Welcome to your secure space.</p>
    </div>
  );
}