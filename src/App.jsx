import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import AuthPage from "./components/Auth/AuthPage";
import Dashboard from "./pages/Dashboard";
import VaultedDocuments from "./components/PrivateVault/VaultedDocuments";
import VaultedFileUpload from "./components/PrivateVault/FileUpload";
import VaultedNoteUpload from "./components/PrivateVault/NoteUpload";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/private/vaults" element={<VaultedDocuments />} />
        <Route path="/private/vaults/file-upload" element={<VaultedFileUpload />} />
        <Route path="/private/vaults/note-upload" element={<VaultedNoteUpload />} />
        <Route path="/" element={<AuthPage />} />
        <Route path="/dashboard" element={<Dashboard />} />
      </Routes>
    </Router>
  );
}

export default App;
