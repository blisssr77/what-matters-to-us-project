import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Users,
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
            <h1 className="text-2xl font-extrabold bg-gradient-to-r from-purple-500 via-indigo-200 to-blue-500 bg-clip-text text-transparent animate-pulse-slow">
              WhatMatters
            </h1>
          )}
          <button onClick={() => setCollapsed(!collapsed)}>
            <Menu size={20} />
          </button>
        </div>

        <ul className="space-y-1">
          {navLink("Dashboard", <LayoutDashboard size={18} />, "/dashboard", "text-sm")}

          <hr className="my-6 border-gray-800" />

          {/* Workspace Vault Toggle */}
          <li
            onClick={() => setWorkspaceOpen(!workspaceOpen)}
            className="flex items-center justify-between px-4 py-2 rounded hover:bg-gray-800 cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <Users size={18} className="text-purple-400" />
              {!collapsed && (
                <span className="bg-gradient-to-r from-purple-400 via-indigo-400 to-blue-400 bg-clip-text text-transparent animate-pulse-slow">
                  Workspace Vault
                </span>
              )}
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
                className="ml-5 border-l border-gray-800 pl-3 space-y-1 text-xs"
              >
                {navLink("Projects Planner", <FolderKanban size={16} />, "/workspace/projects", "text-xs")}
                {navLink("Messenger", <MessageCircle size={16} />, "/workspace/messenger", "text-xs")}
                {navLink("Calendar", <CalendarDays size={16} />, "/workspace/calendar", "text-xs")}
                {navLink("Documents", <FileText size={16} />, "/workspace/documents", "text-xs")}
                {navLink("Vaulted Documents", <Lock size={16} />, "/workspace/vaults", "text-xs")}
              </motion.ul>
            )}
          </AnimatePresence>

          <hr className="my-6 border-gray-800" />

          {/* My Private Vault Toggle */}
          <li
            onClick={() => setPrivateOpen(!privateOpen)}
            className="flex items-center justify-between px-4 py-2 rounded hover:bg-gray-800 cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <Lock size={18} className="text-purple-400" />
              {!collapsed && (
                <span className="bg-gradient-to-r from-purple-400 via-indigo-400 to-blue-400 bg-clip-text text-transparent animate-pulse-slow">
                  My Private Vault
                </span>
              )}
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
                className="ml-5 border-l border-gray-800 pl-3 space-y-1 text-xs"
              >
                {navLink("Projects Planner", <FolderKanban size={16} />, "/private/projects", "text-xs")}
                {navLink("Messenger", <MessageCircle size={16} />, "/private/messenger", "text-xs")}
                {navLink("Calendar", <CalendarDays size={16} />, "/private/calendar", "text-xs")}
                {navLink("Documents", <FileText size={16} />, "/private/documents", "text-xs")}
                {navLink("Vaulted Documents", <Lock size={16} />, "/private/vaults", "text-xs")}
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
        className="flex items-center gap-2 hover:text-red-400 transition p-4 text-sm"
      >
        <LogOut size={18} />
        {!collapsed && "Log Out"}
      </motion.button>
    </motion.aside>
  );
}
