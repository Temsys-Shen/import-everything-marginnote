import MNBridge from "../lib/mnBridge";

function PanelNotchButton() {
  const handleClose = () => {
    MNBridge.send("closePanel", {}).catch((error) => {
      const message = error && error.message ? error.message : String(error);
      console.log(`[ImportEverything] close panel failed: ${message}`);
    });
  };

  return (
    <button
      type="button"
      className="panel-notch-button"
      aria-label="收起插件面板"
      title="收起插件面板"
      onClick={handleClose}
    >
      <span className="panel-notch-chevron" aria-hidden="true">
        &lt;
      </span>
    </button>
  );
}

export default PanelNotchButton;
