import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import AuthPage from "./components/Auth/AuthPage";
import Dashboard from "./pages/Dashboard";
import VaultedDocuments from "./components/PrivateVault/VaultedDocuments";
import VaultedFileUpload from "./components/PrivateVault/VaultedDocUpload";
import VaultedNoteUpload from "./components/PrivateVault/VaultedNoteUpload";
import NoteDetail from "./components/PrivateVault/VaultedNoteDetail";
import ManageAccount from "./pages/Account/ManageAccount";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<AuthPage />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/account/manage" element={<ManageAccount />} />


        <Route path="/private/vaults" element={<VaultedDocuments />} />
        <Route path="/private/vaults/file-upload" element={<VaultedFileUpload />} />
        <Route path="/private/vaults/note-upload" element={<VaultedNoteUpload />} />
        <Route path="/private/vaults/note/:id" element={<NoteDetail />} />
      </Routes>
    </Router>
  );
}

export default App;
