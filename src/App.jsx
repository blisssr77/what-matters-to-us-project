import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import AuthPage from "./components/Auth/AuthPage";
import Dashboard from "./pages/Dashboard";
import ManageAccount from "./pages/Account/ManageAccount";
// Importing components for the Private Vault
import VaultedDocuments from "./routes/private/vaulted-docs/VaultedDocList";
import VaultedFileUpload from "./components/PrivateVault/VaultedDocs/VaultUploadDoc";
import VaultedNoteUpload from "./components/PrivateVault/VaultedDocs/VaultUploadNote";
import VaultViewNote from "./components/PrivateVault/VaultedDocs/VaultViewNote";
import VaultEditNote from "./components/PrivateVault/VaultedDocs/VaultEditNote";
import VaultViewDoc from "./components/PrivateVault/VaultedDocs/VaultViewDoc";
import VaultEditDoc from "./components/PrivateVault/VaultedDocs/VaultEditDoc";
// Importing components for the Workspace Vault
import WorkspaceVaultList from "./routes/workspace/workspace-docs/DocList";
import WorkspaceUploadDoc from "./components/Workspace/WorkspaceDocs/UploadDoc";
import WorkspaceUploadNote from "./components/Workspace/WorkspaceDocs/UploadNote";
import WorkspaceViewNote from "./components/Workspace/WorkspaceDocs/ViewNote";
import WorkspaceEditNote from "./components/Workspace/WorkspaceDocs/EditNote";
import WorkspaceViewDoc from "./components/Workspace/WorkspaceDocs/ViewDoc";
import WorkspaceEditDoc from "./components/Workspace/WorkspaceDocs/EditDoc";

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
