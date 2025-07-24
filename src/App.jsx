import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import AuthPage from "./components/Auth/AuthPage";
import Dashboard from "./pages/Dashboard";
import ManageAccount from "./pages/Account/ManageAccount";
import VaultedDocuments from "./components/PrivateVault/VaultDocuments";
import VaultedFileUpload from "./components/PrivateVault/VaultUploadDoc";
import VaultedNoteUpload from "./components/PrivateVault/VaultUploadNote";
import VaultViewNote from "./components/PrivateVault/VaultViewNote";
import VaultEditNote from "./components/PrivateVault/VaultEditNote";
import VaultViewDoc from "./components/PrivateVault/VaultViewDoc";
import VaultEditDoc from "./components/PrivateVault/VaultEditDoc";

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
        <Route path="/private/vaults/note-view/:id" element={<VaultViewNote />} />
        <Route path="/private/vaults/note-edit/:id" element={<VaultEditNote />} />

        <Route path="/private/vaults/doc-view/:id" element={<VaultViewDoc />} />
        <Route path="/private/vaults/doc-edit/:id" element={<VaultEditDoc />} />
      </Routes>
    </Router>
  );
}

export default App;
