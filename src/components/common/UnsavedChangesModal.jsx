import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useOutsideClick } from "../../hooks/useOutsideClick";

export function UnsavedChangesModal({
  show,
  message,
  onCancel,
  redirectPath = "/workspace/vaults",
  icon = "\u26A0\uFE0F", // default warning emoji
  autoCloseInSec = null,
}) {
  const navigate = useNavigate();
  const modalRef = useRef();

  // Auto-close after X seconds
  useEffect(() => {
    if (show && autoCloseInSec) {
      const timer = setTimeout(() => {
        navigate(redirectPath);
      }, autoCloseInSec * 1000);
      return () => clearTimeout(timer);
    }
  }, [show, autoCloseInSec, navigate, redirectPath]);

  // Close on outside click
  useOutsideClick(modalRef, onCancel, show);

  return (
    <AnimatePresence>
        {show && (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed top-4 mt-16 right-4 z-50 bg-white rounded-lg shadow-lg p-4 w-full max-w-sm text-sm"
                ref={modalRef}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                >
                <div className="flex items-start gap-2 mb-4">
                    {/* <span className="text-xl">{icon}</span> */}
                    <p className="text-gray-800">
                    {message || "You have unsaved changes. Are you sure you want to leave?"}
                    </p>
                </div>

                <div className="flex justify-end gap-3 mt-4">
                    <button
                        onClick={() => navigate(redirectPath)}
                        className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
                    >
                    Leave Anyway
                    </button>
                    <button
                        onClick={onCancel}
                        className="px-3 py-1 bg-gray-300 text-gray-800 rounded hover:bg-gray-400"
                    >
                    Cancel
                    </button>
                </div>
                </motion.div>
            </motion.div>
        )}
    </AnimatePresence>
    );
}
