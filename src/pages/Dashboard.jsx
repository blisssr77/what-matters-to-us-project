import Sidebar from "../components/Layout/Sidebar";
import Topbar from "../components/Layout/Topbar";
import { motion } from "framer-motion";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useWorkspaceInit } from "../hooks/useWorkspaceInit";

export default function Dashboard() {
  const [userId, setUserId] = useState(null);

  // Fetch user ID on component mount
  useEffect(() => {
    const fetchUser = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (data?.user?.id) {
        setUserId(data.user.id);
      } else {
        console.error("No user found or error:", error);
      }
    };

    fetchUser();
  }, []);
  // Initialize workspace when user ID is available
  useWorkspaceInit(userId);

  return (
    <div className="flex min-h-screen bg-[#0f0f1c] text-white">
      <Sidebar />
      <div className="flex flex-col flex-grow">
        <Topbar />
        <motion.main
          className="flex-grow p-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <h1 className="text-3xl font-bold mb-4 text-purple-300">
            Welcome to your Secure Space 👽
          </h1>
          <p className="text-gray-400">
            Store encrypted chats, files, and vaults that matter.
          </p>
        </motion.main>
      </div>
    </div>
  );
}