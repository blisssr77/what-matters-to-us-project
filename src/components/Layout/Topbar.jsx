import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, Settings, LogOut, Shield } from "lucide-react";
import { supabase } from "../../lib/supabaseClient"; 

/* --- Topbar component --- */
export default function Topbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  const [profile, setProfile] = useState({ username: "", email: "" });

  /* Close on outside click */
  useEffect(() => {
    const close = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  // Fetch current user profile
  useEffect(() => {
    const fetchProfile = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user?.id) {
        const { data, error } = await supabase
          .from("profiles")
          .select("username, email")
          .eq("id", user.id)
          .single();

        if (!error && data) {
          setProfile({
            username: data.username || "",
            email: data.email || "",
          });
        }
      }
    };

    fetchProfile();
  }, []);

  const displayName = profile.username || "User";
  const displayEmail = profile.email || "No email";

  return (
    <motion.header
      initial={{ y: -30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 70, delay: 0.2 }}
      className="w-full h-16 px-6 flex items-center justify-between bg-gray-950/80 backdrop-blur-md border-b border-gray-800 text-white shadow-lg z-[100]"
    >
      <h2 className="text-xl font-bold bg-gradient-to-r from-purple-400 via-indigo-400 to-blue-400 bg-clip-text text-transparent animate-pulse-slow">
        {location.pathname.includes("/workspace")
          ? "Workspace"
          : location.pathname.includes("/private")
          ? "Private Space"
          : "Dashboard"}
      </h2>

      {/* Profile button */}
      <div className="relative" ref={menuRef}>
        <motion.div
          whileHover={{ scale: 1.08, boxShadow: "0 0 12px rgba(168,85,247,0.8)" }}
          className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center cursor-pointer ring-0 ring-gray-500/30"
          onClick={() => setOpen((p) => !p)}
        >
          {displayName.slice(0, 2).toUpperCase()}
        </motion.div>

        {/* ---------- Dropdown ---------- */}
        <AnimatePresence>
          {open && (
            <motion.div
             initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute right-0 mt-3 w-64 rounded-xl overflow-hidden bg-gray-900/90 border border-gray-800 backdrop-blur-lg shadow-xl"
            >
              {/* Top profile preview */}
              <div className="px-4 py-3 border-b border-gray-800">
                <p className="font-semibold text-sm">{displayName}</p>
                <p className="text-xs text-gray-400">{displayEmail}</p>
              </div>

              {/* Menu items */}
              <button
                onClick={() => {
                  navigate("/notifications");
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-gray-800 text-sm"
              >
                <Bell size={16} /> Notifications
              </button>

              <button
                onClick={() => {
                  navigate("/account/manage");
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-gray-800 text-sm"
              >
                <Settings size={16} /> Account Settings
              </button>

              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                  navigate("/");
                }}
                className="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-gray-800 text-sm text-red-400"
              >
                <LogOut size={16} /> Log out
              </button>

              <a
                href="/legal"
                target="_blank"
                className="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-gray-800 text-sm"
              >
                <Shield size={16} /> Privacy & Terms
              </a>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.header>
  );
}