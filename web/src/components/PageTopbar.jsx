function PageTopbar({ label, onBack, backText = "返回" }) {
  return (
    <header className="page-topbar">
      <button type="button" className="button button-ghost button-small" onClick={onBack}>
        {backText}
      </button>
      <span className="page-topbar-title">{label}</span>
    </header>
  );
}

export default PageTopbar;
