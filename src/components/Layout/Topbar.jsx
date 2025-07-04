import { motion } from "framer-motion";
import { useLocation } from "react-router-dom";

export default function Topbar() {
  const location = useLocation();

  const getTabName = () => {
    if (location.pathname.includes("/workspace")) return "Workspace Vaults";
    if (location.pathname.includes("/private")) return "Private Vaults";
    return "Dashboard";
  };

  return (
    <motion.header
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.3, duration: 0.4 }}
      className="w-full h-16 px-6 flex items-center justify-between bg-gray-950 border-b border-gray-800 text-white shadow"
    >
      <h2 className="text-xl font-semibold text-purple-400">{getTabName()}</h2>
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-indigo-500"></div>
    </motion.header>
  );
}
