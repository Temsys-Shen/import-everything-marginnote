import { NavLink, Route, Routes } from "react-router-dom";
import HomePage from "./pages/HomePage";
import BridgePage from "./pages/BridgePage";

function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>MarginNoteWebTemplate</h1>
      </header>
      <nav className="app-nav">
        <NavLink to="/" end>
          Dashboard
        </NavLink>
        <NavLink to="/bridge">Bridge Demo</NavLink>
      </nav>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/bridge" element={<BridgePage />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
