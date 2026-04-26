import ProgressCard from "./ProgressCard";

function ProgressPopup({ title, description, percent, fileName, actionLabel }) {
  return (
    <div className="progress-popup-layer" role="dialog" aria-modal="true" aria-label={title}>
      <div className="progress-popup-backdrop" />
      <section className="progress-popup-card">
        <div className="progress-popup-head">
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        <ProgressCard percent={percent} fileName={fileName} actionLabel={actionLabel} />
      </section>
    </div>
  );
}

export default ProgressPopup;
