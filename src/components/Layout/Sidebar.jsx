import { motion } from "framer-motion";
import { Home, Lock, File, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function Sidebar() {
  const navigate = useNavigate();

  const navItems = [
    { name: "Dashboard", icon: <Home />, route: "/dashboard" },
    { name: "Vaults", icon: <Lock />, route: "/vaults" },
    { name: "Files", icon: <File />, route: "/files" },
  ];

  return (
    <motion.aside
      initial={{ x: -100, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="w-64 h-screen bg-gradient-to-b from-gray-900 to-black p-6 text-white flex flex-col justify-between shadow-2xl"
    >
      <div>
        <h1 className="text-2xl font-bold mb-10 tracking-wide text-purple-400">
          🔐 WhatMatters
        </h1>
        <ul className="space-y-4">
          {navItems.map((item) => (
            <motion.li
              key={item.name}
              whileHover={{
                scale: 1.05,
                boxShadow: "0 0 10px rgba(128, 90, 213, 0.6)",
              }}
              className="flex items-center gap-3 p-3 hover:bg-gray-800 rounded cursor-pointer transition"
              onClick={() => navigate(item.route)}
            >
              {item.icon}
              <span>{item.name}</span>
            </motion.li>
          ))}
        </ul>
      </div>

      <motion.button
        whileHover={{
          scale: 1.05,
          color: "#f87171",
          boxShadow: "0 0 10px rgba(239, 68, 68, 0.4)",
        }}
        onClick={async () => {
          await supabase.auth.signOut();
          navigate("/");
        }}
        className="flex items-center gap-2 text-sm hover:text-red-400 transition"
      >
        <LogOut size={18} />
        Log Out
      </motion.button>
    </motion.aside>
  );
}
