import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import AuthPage from "./components/Auth/AuthPage";
import Dashboard from "./pages/Dashboard";
import VaultedDocuments from "./components/Vault/VaultedDocuments";
import VaultedUpload from "./components/Vault/VaultUpload";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/private/vaults" element={<VaultedDocuments />} />
        <Route path="/private/vaults/upload" element={<VaultedUpload />} />
        <Route path="/" element={<AuthPage />} />
        <Route path="/dashboard" element={<Dashboard />} />
      </Routes>
    </Router>
  );
}

export default App;
