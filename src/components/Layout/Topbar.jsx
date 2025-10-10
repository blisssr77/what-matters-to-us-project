import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, Settings, LogOut, Shield } from "lucide-react";
import { supabase } from "../../lib/supabaseClient"; 
import GlobalSearch from "../Search/GlobalSearch";

/* --- Topbar component --- */
export default function Topbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  const [profile, setProfile] = useState({ username: "", email: "" });

  // Determine page title based on URL path
  const pageTitle = useMemo(() => {
    const p = location.pathname.toLowerCase();

    // Workspace
    if (/^\/workspace\/projects/.test(p))   return "Workspace Project Planner";
    if (/^\/workspace\/messenger/.test(p)) return "Workspace Messenger";
    if (/^\/workspace\/vaults\/doc-view/.test(p))  return "Workspace Doc";
    if (/^\/workspace\/vaults\/note-view/.test(p)) return "Workspace Note";
    if (/^\/workspace\/vaults\/tags/.test(p))      return "Workspace Tags";
    if (/^\/workspace\/vaults/.test(p))    return "Workspace Docs";
    if (/^\/workspace(\/|$)/.test(p))      return "Workspace";

    // Private Space
    if (/^\/privatespace\/vaults\/doc-view/.test(p))  return "Private Space Doc";
    if (/^\/privatespace\/vaults\/note-view/.test(p)) return "Private Space Note";
    if (/^\/privatespace\/vaults\/tags/.test(p))   return "Private Space Tags";
    if (/^\/privatespace\/vaults/.test(p)) return "Private Space Docs";
    if (/^\/privatespace(\/|$)/.test(p))   return "Private Space";

    // Other major areas
    if (/^\/calendar/.test(p))             return "Calendar";
    if (/^\/account\/manage/.test(p))      return "Manage Account";
    if (/^\/dashboard/.test(p))            return "Dashboard";

    return "WhatMatters";
  }, [location.pathname]);

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
      className="w-full bg-gray-950/80 backdrop-blur-md border-b border-gray-800 text-white shadow-lg z-[100]"
    >
      {/* Top row: search (left, grows) + profile (right) */}
      <div className="h-16 px-4 sm:px-6 flex items-center gap-3">
        <div className="flex-1">
          <GlobalSearch className="w-full max-w-none" />
        </div>

        {/* Profile button */}
        <div className="relative" ref={menuRef}>
          <motion.div
            whileHover={{ scale: 1.08, boxShadow: "0 0 12px rgba(168,85,247,0.8)" }}
            className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center cursor-pointer ring-0 ring-gray-500/30 select-none"
            onClick={() => setOpen((p) => !p)}
          >
            {displayName.slice(0, 2).toUpperCase()}
          </motion.div>

          <AnimatePresence>
            {open && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute right-0 mt-3 w-64 rounded-xl overflow-hidden bg-gray-900/90 border border-gray-800 backdrop-blur-lg shadow-xl"
              >
                <div className="px-4 py-3 border-b border-gray-800">
                  <p className="font-semibold text-sm">{displayName}</p>
                  <p className="text-xs text-gray-400">{displayEmail}</p>
                </div>

                <button
                  onClick={() => { navigate("/notifications"); setOpen(false); }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-gray-800 text-sm"
                >
                  <Bell size={16} /> Notifications
                </button>

                <button
                  onClick={() => { navigate("/account/manage"); setOpen(false); }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-gray-800 text-sm"
                >
                  <Settings size={16} /> Account Settings
                </button>

                <button
                  onClick={async () => { await supabase.auth.signOut(); navigate("/"); }}
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
      </div>

      {/* Bottom row: centered page title */}
      <div className="px-4 sm:px-6 pb-2">
        <h2 className="inline-block text-lg font-extrabold bg-gradient-to-r from-blue-300 via-indigo-200 to-purple-300 bg-clip-text text-transparent animate-pulse-slow">
          {pageTitle}
        </h2>
      </div>
    </motion.header>
  );
}