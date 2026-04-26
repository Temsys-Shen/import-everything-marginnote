import { Link } from "react-router-dom";

function ModeSelectPage() {
  return (
    <div className="app-shell mode-shell">
      <Link className="entry-card doc-entry" to="/document">
        <span className="icon-wrapper" aria-hidden="true">📄</span>
        <strong className="entry-title">导入文档</strong>
        <span className="entry-arrow" aria-hidden="true">➔</span>
      </Link>

      <Link className="entry-card mindmap-entry" to="/mindmap">
        <span className="icon-wrapper" aria-hidden="true">🕸️</span>
        <strong className="entry-title">导入脑图</strong>
        <span className="entry-arrow" aria-hidden="true">➔</span>
      </Link>
    </div>
  );
}

export default ModeSelectPage;
