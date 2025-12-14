import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useOnboardingStore } from "@/store/useOnboardingStore";
import { supabase } from "../../lib/supabaseClient";

// --- 1. NEW IMPORTS FOR CHAT ---
import { useConversationStore } from "@/store/useConversationStore.js";
import useUnreadChatCount from "@/hooks/useUnreadChatCount.js"; 
import { useAuthStore } from "@/store/useAuthStore.js";
// -------------------------------

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

export default function Sidebar() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
    
  // Get conversations to calculate total unreads
  const { conversations, fetchConversations } = useConversationStore();

  // 1. Activate the Listener
  useUnreadChatCount();

  // 2. FETCH DATA ON MOUNT (Updated for Auth Race Condition)
  useEffect(() => {
    const initData = async () => {
      // Option A: User is already in the store
      if (user?.id) {
        console.log("User found in store, fetching chats...");
        fetchConversations(user.id);
        return;
      }

      // Option B: Store is empty? Check Supabase directly (Fixes page refresh)
      console.log("User not in store yet, checking Supabase session...");
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user?.id) {
        console.log("Found user via Supabase direct check:", session.user.id);
        fetchConversations(session.user.id);
      } else {
        console.log("No active session found.");
      }
    };

    initData();
  }, [user?.id]); // Still listen for store changes

  // Calculate total unread messages across all chats
  const totalUnreadCount = (conversations || []).reduce(
    (acc, curr) => acc + (curr.unreadCount || 0), 
    0
  );
  console.log("DEBUG SIDEBAR:", { 
  conversations, 
  firstItem: conversations?.[0], 
  totalUnreadCount 
});
  // ---------------------

  const [workspaceOpen, setWorkspaceOpen] = useState(true);
  const [privateOpen, setPrivateOpen] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  // --- 3. UPDATED LOGIC TO EXPAND SIDEBAR ON CLICK ---
  const handleSectionToggle = (section) => {
    // If sidebar is collapsed, expand it first
    if (collapsed) {
      setCollapsed(false);
      // Ensure the section we clicked opens up
      if (section === "workspace") setWorkspaceOpen(true);
      if (section === "private") setPrivateOpen(true);
    } else {
      // Normal toggle behavior
      if (section === "workspace") setWorkspaceOpen(!workspaceOpen);
      if (section === "private") setPrivateOpen(!privateOpen);
    }
  };

  // --- 4. UPDATED NAVLINK WITH BADGE SUPPORT ---
  const navLink = (label, icon, route, textSize = "text-base", badgeCount = 0) => (
    <motion.li
      whileHover={{ scale: 1.04, boxShadow: "0 0 8px rgba(168,85,247,0.3)" }}
      onClick={() => navigate(route)}
      className={`relative flex items-center gap-3 px-4 py-2 rounded hover:bg-gray-800 cursor-pointer ${textSize}`}
    >
      {/* Icon Wrapper (Relative for collapsed badge) */}
      <div className="relative">
        {icon}
        {/* Mini Badge for Collapsed View */}
        {collapsed && badgeCount > 0 && (
          <span className="absolute -top-2 -right-2 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold">
            {badgeCount > 9 ? "9+" : badgeCount}
          </span>
        )}
      </div>

      {!collapsed && (
        <div className="flex w-full items-center justify-between">
          <span>{label}</span>
          {/* Full Badge for Expanded View */}
          {badgeCount > 0 && (
            <span className="flex items-center justify-center rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
              {badgeCount}
            </span>
          )}
        </div>
      )}
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
            <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-500 via-indigo-200 to-blue-500 bg-clip-text text-transparent animate-pulse-slow">
              WhatMatters
            </h1>
          )}
          <button onClick={() => setCollapsed(!collapsed)}>
            <Menu size={20} />
          </button>
        </div>

        <ul className="space-y-1">
          {navLink("Dashboard", <LayoutDashboard size={18} />, "/dashboard", "text-sm")}
          {navLink("Calendar", <CalendarDays size={18} />, "/calendar", "text-sm")}

          <hr className="my-6 border-gray-800" />

          {/* Workspace Vault Toggle */}
          <li
            onClick={() => handleSectionToggle("workspace")}
            className="flex items-center justify-between px-4 py-2 rounded hover:bg-gray-800 cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <Users size={18} className="text-purple-400" />
              {!collapsed && (
                <span className="bg-gradient-to-r from-purple-400 via-indigo-400 to-blue-400 bg-clip-text text-transparent animate-pulse-slow">
                  My Workspace
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

          {/* Workspace Vault Submenu */}
          <AnimatePresence>
            {workspaceOpen && !collapsed && (
              <motion.ul
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="ml-5 border-l border-gray-800 pl-3 space-y-1 text-xs"
              >
                {navLink("Projects Planner", <FolderKanban size={16} />, "/workspace/projects", "text-xs")}
                
                {/* --- PASSING THE UNREAD COUNT HERE --- */}
                {navLink(
                    "Messenger", 
                    <MessageCircle size={16} />, 
                    "/workspace/messenger", 
                    "text-xs", 
                    totalUnreadCount
                )}
                {/* ----------------------------------- */}

                {navLink("Docs", <Lock size={16} />, "/workspace/vaults", "text-xs")}
                {navLink("Tags", <FileText size={16} />, "/workspace/vaults/tags", "text-xs")}
              </motion.ul>
            )}
          </AnimatePresence>

          <hr className="my-6 border-gray-800" />

          {/* My Private Vault Toggle */}
          <li
            onClick={() => handleSectionToggle("private")}
            className="flex items-center justify-between px-4 py-2 rounded hover:bg-gray-800 cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <Lock size={18} className="text-purple-400" />
              {!collapsed && (
                <span className="bg-gradient-to-r from-purple-400 via-indigo-400 to-blue-400 bg-clip-text text-transparent animate-pulse-slow">
                  My Private Space
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

          {/* Private Vault Submenu */}
          <AnimatePresence>
            {privateOpen && !collapsed && (
              <motion.ul
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="ml-5 border-l border-gray-800 pl-3 space-y-1 text-xs"
              >
                {navLink("Projects Planner", <FolderKanban size={16} />, "/workspace/projects", "text-xs")}
                {navLink("Docs", <Lock size={16} />, "/privatespace/vaults", "text-xs")}
                {navLink("Tags", <FileText size={16} />, "/privatespace/vaults/tags", "text-xs")}
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