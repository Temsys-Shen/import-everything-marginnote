import { ArrowLeft } from "lucide-react";

function PageTopbar({ label, onBack, backText = "返回" }) {
  return (
    <header className="page-topbar">
      <button type="button" className="button button-ghost button-small page-topbar-back" onClick={onBack}>
        <ArrowLeft size={16} />
        <span>{backText}</span>
      </button>
      <span className="page-topbar-title">{label}</span>
    </header>
  );
}

export default PageTopbar;
