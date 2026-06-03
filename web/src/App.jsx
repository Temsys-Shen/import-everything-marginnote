import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import DocumentImportPage from "./pages/DocumentImportPage";
import MindmapImportPage from "./pages/MindmapImportPage";
import ModeSelectPage from "./pages/ModeSelectPage";
import PanelNotchButton from "./components/PanelNotchButton";

function App() {
  return (
    <HashRouter>
      <PanelNotchButton />
      <Routes>
        <Route path="/" element={<ModeSelectPage />} />
        <Route path="/document" element={<DocumentImportPage />} />
        <Route path="/mindmap" element={<MindmapImportPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}

export default App;
