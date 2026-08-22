import { Link } from "react-router-dom";
import { FileText, Network, Video, ChevronRight } from "lucide-react";

function ModeSelectPage() {
  return (
    <div className="app-shell mode-shell">
      <Link className="entry-card doc-entry" to="/document">
        <span className="icon-wrapper" aria-hidden="true"><FileText size={20} /></span>
        <strong className="entry-title">导入文档</strong>
        <span className="entry-arrow" aria-hidden="true"><ChevronRight size={16} /></span>
      </Link>

      <Link className="entry-card mindmap-entry" to="/mindmap">
        <span className="icon-wrapper" aria-hidden="true"><Network size={20} /></span>
        <strong className="entry-title">导入脑图</strong>
        <span className="entry-arrow" aria-hidden="true"><ChevronRight size={16} /></span>
      </Link>

      <Link className="entry-card bili-entry" to="/video">
        <span className="icon-wrapper" aria-hidden="true"><Video size={20} /></span>
        <strong className="entry-title">导入视频</strong>
        <span className="entry-arrow" aria-hidden="true"><ChevronRight size={16} /></span>
      </Link>
    </div>
  );
}

export default ModeSelectPage;
