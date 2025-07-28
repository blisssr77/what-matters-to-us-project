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
  Menu,
  X,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";

export default function Sidebar() {
  const navigate = useNavigate();
  const [workspaceOpen, setWorkspaceOpen] = useState(true);
  const [privateOpen, setPrivateOpen] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  const navLink = (label, icon, route, textSize = "text-base") => (
    <motion.li
      whileHover={{ scale: 1.04, boxShadow: "0 0 8px rgba(168,85,247,0.3)" }}
      onClick={() => navigate(route)}
      className={`flex items-center gap-3 px-4 py-2 rounded hover:bg-gray-800 cursor-pointer ${textSize}`}
    >
      {icon}
      {!collapsed && <span>{label}</span>}
    </motion.li>
  );

  return (
    <motion.aside
      initial={{ width: 260 }}
      animate={{ width: collapsed ? 72 : 260 }}
      transition={{ duration: 0.3 }}
      className="h-screen bg-gradient-to-b from-gray-950 to-black text-white flex flex-col justify-between shadow-2xl border-r border-gray-800"
    >
      <div>
        <div className="flex items-center justify-between p-4">
          {!collapsed && (
            <h1 className="text-xl font-bold text-purple-500 tracking-wide whitespace-nowrap">
              🔐 WhatMatters
            </h1>
          )}
          <button onClick={() => setCollapsed(!collapsed)}>
            <Menu size={20} />
          </button>
        </div>

        <ul className="space-y-1">
          {navLink("Dashboard", <LayoutDashboard size={18} />, "/dashboard")}

          <hr className="my-6 border-gray-800" />

          {/* Workspace Vault Toggle */}
          <li
            onClick={() => setWorkspaceOpen(!workspaceOpen)}
            className="flex items-center justify-between px-4 py-2 rounded hover:bg-gray-800 cursor-pointer"
          >
            <div className="flex items-center gap-3 text-purple-400">
              <FolderKanban size={18} />
              {!collapsed && <span>Workspace Vault</span>}
            </div>
            {!collapsed &&
              (workspaceOpen ? (
                <ChevronDown size={16} className="text-gray-400" />
              ) : (
                <ChevronRight size={16} className="text-gray-400" />
              ))}
          </li>

          <AnimatePresence>
            {workspaceOpen && !collapsed && (
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

          {/* My Private Vault Toggle */}
          <li
            onClick={() => setPrivateOpen(!privateOpen)}
            className="flex items-center justify-between px-4 py-2 rounded hover:bg-gray-800 cursor-pointer"
          >
            <div className="flex items-center gap-3 text-purple-400">
              <Lock size={18} />
              {!collapsed && <span>My Private Vault</span>}
            </div>
            {!collapsed &&
              (privateOpen ? (
                <ChevronDown size={16} className="text-gray-400" />
              ) : (
                <ChevronRight size={16} className="text-gray-400" />
              ))}
          </li>

          <AnimatePresence>
            {privateOpen && !collapsed && (
              <motion.ul
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="ml-5 border-l border-gray-800 pl-3 space-y-1"
              >
                {navLink("Projects Planner", <FolderKanban size={16} />, "/private/projects", "text-sm")}
                {navLink("Messenger", <MessageCircle size={16} />, "/private/messenger", "text-sm")}
                {navLink("Calendar", <CalendarDays size={16} />, "/private/calendar", "text-sm")}
                {navLink("Documents", <FileText size={16} />, "/private/documents", "text-sm")}
                {navLink("Vaulted Documents", <Lock size={16} />, "/private/vaults", "text-sm")}
              </motion.ul>
            )}
          </AnimatePresence>
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
        className="flex items-center gap-2 text-base hover:text-red-400 transition p-4"
      >
        <LogOut size={18} />
        {!collapsed && "Log Out"}
      </motion.button>
    </motion.aside>
  );
}
