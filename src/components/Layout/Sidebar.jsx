import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  FolderKanban,
  MessageCircle,
  CalendarDays,
  FileText,
  Lock,
  LogOut,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

export default function Sidebar() {
  const navigate = useNavigate();
  const [workspaceOpen, setWorkspaceOpen] = useState(true);

  const navLink = (label, icon, route, textSize = "text-base") => (
    <motion.li
      whileHover={{ scale: 1.04, boxShadow: "0 0 8px rgba(168,85,247,0.3)" }}
      onClick={() => navigate(route)}
      className={`flex items-center gap-3 px-4 py-2 rounded hover:bg-gray-800 cursor-pointer ${textSize}`}
    >
      {icon}
      <span>{label}</span>
    </motion.li>
  );

  return (
    <aside className="w-64 h-screen bg-gradient-to-b from-gray-950 to-black p-6 text-white flex flex-col justify-between shadow-2xl border-r border-gray-800">
      <div>
        <h1 className="text-xl font-bold mb-8 text-purple-500 tracking-wide">
          🔐 WhatMatters
        </h1>
        <ul className="space-y-1">
          {navLink("Dashboard", <LayoutDashboard size={18} />, "/dashboard")}

          {/* Workspace Vault Toggle */}
          <li
            onClick={() => setWorkspaceOpen(!workspaceOpen)}
            className="flex items-center justify-between px-4 py-2 rounded hover:bg-gray-800 cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <FolderKanban size={18} />
              <span>Workspace Vault</span>
            </div>
            {workspaceOpen ? (
              <ChevronDown size={16} className="text-gray-400" />
            ) : (
              <ChevronRight size={16} className="text-gray-400" />
            )}
          </li>

          <AnimatePresence>
            {workspaceOpen && (
              <motion.ul
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="ml-5 border-l border-gray-800 pl-3 space-y-1"
              >
                {navLink("Projects Planner", <FolderKanban size={16} />, "/workspace/projects", "text-sm")}
                {navLink("Messenger", <MessageCircle size={16} />, "/workspace/messenger", "text-sm")}
                {navLink("Calendar", <CalendarDays size={16} />, "/workspace/calendar", "text-sm")}
                {navLink("Documents", <FileText size={16} />, "/workspace/documents", "text-sm")}
                {navLink("Vaulted Documents", <Lock size={16} />, "/workspace/vaults", "text-sm")}
              </motion.ul>
            )}
          </AnimatePresence>

          <hr className="my-6 border-gray-800" />

          <li className="text-sm uppercase tracking-wide text-purple-400 mt-4 mb-2 px-3">
            My Private Vault
          </li>
          {navLink("Projects Planner", <FolderKanban size={18} />, "/private/projects")}
          {navLink("Messenger", <MessageCircle size={18} />, "/private/messenger")}
          {navLink("Calendar", <CalendarDays size={18} />, "/private/calendar")}
          {navLink("Documents", <FileText size={18} />, "/private/documents")}
          {navLink("Vaulted Documents", <Lock size={18} />, "/private/vaults")}
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
    </aside>
  );
}
