import { motion } from "framer-motion";

export default function Topbar() {
  return (
    <motion.header
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.3, duration: 0.4 }}
      className="w-full h-16 px-6 flex items-center justify-between bg-gray-950 border-b border-gray-800 text-white shadow"
    >
      <h2 className="text-xl font-semibold text-purple-400">Dashboard</h2>
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-indigo-500"></div>
    </motion.header>
  );
}

