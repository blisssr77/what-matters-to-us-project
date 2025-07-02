import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import AuthPage from "./components/Auth/AuthPage";
import Dashboard from "./pages/Dashboard";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<AuthPage />} />
        <Route path="/dashboard" element={<Dashboard />} />
      </Routes>
    </Router>
  );
}

export default App;
