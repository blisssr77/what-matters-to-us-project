import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import AuthPage from "./components/Auth/AuthPage";
import Dashboard from "./pages/Dashboard";
import ManageAccount from "./pages/Account/ManageAccount";
// Importing components for the Private Vault
import VaultedDocuments from "./components/PrivateVault/VaultList";
import VaultedFileUpload from "./components/PrivateVault/VaultUploadDoc";
import VaultedNoteUpload from "./components/PrivateVault/VaultUploadNote";
import VaultViewNote from "./components/PrivateVault/VaultViewNote";
import VaultEditNote from "./components/PrivateVault/VaultEditNote";
import VaultViewDoc from "./components/PrivateVault/VaultViewDoc";
import VaultEditDoc from "./components/PrivateVault/VaultEditDoc";
// Importing components for the Workspace Vault
import WorkspaceVaultList from "./components/WorkspaceVault/VaultList";
import WorkspaceUploadDoc from "./components/WorkspaceVault/VaultUploadDoc";
import WorkspaceUploadNote from "./components/WorkspaceVault/VaultUploadNote";
import WorkspaceViewNote from "./components/WorkspaceVault/VaultViewNote";
import WorkspaceEditNote from "./components/WorkspaceVault/VaultEditNote";
import WorkspaceViewDoc from "./components/WorkspaceVault/VaultViewDoc";
import WorkspaceEditDoc from "./components/WorkspaceVault/VaultEditDoc";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<AuthPage />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/account/manage" element={<ManageAccount />} />
        {/* Private Vault Routes */}
        <Route path="/private/vaults" element={<VaultedDocuments />} />
        <Route path="/private/vaults/file-upload" element={<VaultedFileUpload />} />
        <Route path="/private/vaults/note-upload" element={<VaultedNoteUpload />} />
        <Route path="/private/vaults/note-view/:id" element={<VaultViewNote />} />
        <Route path="/private/vaults/note-edit/:id" element={<VaultEditNote />} />
        <Route path="/private/vaults/doc-view/:id" element={<VaultViewDoc />} />
        <Route path="/private/vaults/doc-edit/:id" element={<VaultEditDoc />} />
        {/* Workspace Vault Routes */}
        <Route path="/workspace/vaults" element={<WorkspaceVaultList />} />
        <Route path="/workspace/vaults/file-upload" element={<WorkspaceUploadDoc />} />
        <Route path="/workspace/vaults/note-upload" element={<WorkspaceUploadNote />} />
        <Route path="/workspace/vaults/note-view/:id" element={<WorkspaceViewNote />} />
        <Route path="/workspace/vaults/note-edit/:id" element={<WorkspaceEditNote />} />
        <Route path="/workspace/vaults/doc-view/:id" element={<WorkspaceViewDoc />} />
        <Route path="/workspace/vaults/doc-edit/:id" element={<WorkspaceEditDoc />} />
       
      </Routes>
    </Router>
  );
}

export default App;
