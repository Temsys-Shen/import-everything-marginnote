import ProgressCard from "./ProgressCard";

function ProgressPopup({ title, percent, fileName, message, indeterminate }) {
  return (
    <div className="progress-popup-layer" role="dialog" aria-modal="true" aria-label={title}>
      <div className="progress-popup-backdrop" />
      <section className="progress-popup-card">
        <div className="progress-popup-head">
          <h2>{title}</h2>
        </div>
        <ProgressCard
          percent={percent}
          fileName={fileName}
          message={message}
          indeterminate={indeterminate}
        />
      </section>
    </div>
  );
}

export default ProgressPopup;
