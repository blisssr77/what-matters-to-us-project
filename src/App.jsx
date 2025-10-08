import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import AuthPage from "./components/Auth/AuthPage";
import Dashboard from "./pages/Dashboard";
import ManageAccount from "./pages/Account/ManageAccount";
import CalendarPage from "./pages/CalendarPage";

// Importing components for the Private Vault
import PrivateDocList from "./pages/PrivateSpace/P-DocList";
import PrivateUploadDoc from "./components/PrivateSpace/PrivateSpaceDocs/P-UploadDoc";
import PrivateUploadNote from "./components/PrivateSpace/PrivateSpaceDocs/P-UploadNote";
import PrivateViewNote from "./components/PrivateSpace/PrivateSpaceDocs/P-ViewNote";
import PrivateEditNote from "./components/PrivateSpace/PrivateSpaceDocs/P-EditNote";
import PrivateViewDoc from "./components/PrivateSpace/PrivateSpaceDocs/P-ViewDoc";
import PrivateEditDoc from "./components/PrivateSpace/PrivateSpaceDocs/P-EditDoc";
import PrivateTags from "./pages/PrivateSpace/PriateSpaceTags";

// Importing components for the Workspace Vault
import WorkspaceVaultList from "./pages/Workspace/W-DocList";
import WorkspaceUploadDoc from "./components/Workspace/WorkspaceDocs/UploadDoc";
import WorkspaceUploadNote from "./components/Workspace/WorkspaceDocs/UploadNote";
import WorkspaceViewNote from "./components/Workspace/WorkspaceDocs/ViewNote";
import WorkspaceEditNote from "./components/Workspace/WorkspaceDocs/EditNote";
import WorkspaceViewDoc from "./components/Workspace/WorkspaceDocs/ViewDoc";
import WorkspaceEditDoc from "./components/Workspace/WorkspaceDocs/EditDoc";
import WorkspaceTags from "./pages/Workspace/WorkspaceTags";
import WMessenger from "./pages/Workspace/W-Messenger";
import WProjectPlanner from "./pages/Workspace/W-ProjectPlanner";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<AuthPage />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/account/manage" element={<ManageAccount />} />
        {/* Private Vault Routes */}
        <Route path="/privatespace/vaults" element={<PrivateDocList />} />
        <Route path="/privatespace/vaults/file-upload" element={<PrivateUploadDoc />} />
        <Route path="/privatespace/vaults/note-upload" element={<PrivateUploadNote />} />
        <Route path="/privatespace/vaults/note-view/:id" element={<PrivateViewNote />} />
        <Route path="/privatespace/vaults/note-edit/:id" element={<PrivateEditNote />} />
        <Route path="/privatespace/vaults/doc-view/:id" element={<PrivateViewDoc />} />
        <Route path="/privatespace/vaults/doc-edit/:id" element={<PrivateEditDoc />} />
        <Route path="/privatespace/vaults/tags" element={<PrivateTags />} />

        {/* Workspace Vault Routes */}
        <Route path="/workspace/vaults" element={<WorkspaceVaultList />} />
        <Route path="/workspace/vaults/file-upload" element={<WorkspaceUploadDoc />} />
        <Route path="/workspace/vaults/note-upload" element={<WorkspaceUploadNote />} />
        <Route path="/workspace/vaults/note-view/:id" element={<WorkspaceViewNote />} />
        <Route path="/workspace/vaults/note-edit/:id" element={<WorkspaceEditNote />} />
        <Route path="/workspace/vaults/doc-view/:id" element={<WorkspaceViewDoc />} />
        <Route path="/workspace/vaults/doc-edit/:id" element={<WorkspaceEditDoc />} />
        <Route path="/workspace/vaults/tags" element={<WorkspaceTags />} />
        <Route path="/workspace/messenger" element={<WMessenger />} />
        <Route path="/workspace/projects" element={<WProjectPlanner />} />
      </Routes>
    </Router>
  );
}

export default App;
