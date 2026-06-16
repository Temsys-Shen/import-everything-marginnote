import { formatPercent } from "../progress/progressModel";

function ProgressCard({ percent, fileName, message, indeterminate }) {
  return (
    <section className="progress-card">
      <div className="progress-card-top">
        <span className="progress-tag">{message || "处理中…"}</span>
        <strong>{indeterminate ? "处理中…" : formatPercent(percent)}</strong>
      </div>

      <div className="progress-track" aria-hidden="true">
        <div
          className={`progress-fill${indeterminate ? " indeterminate" : ""}`}
          style={indeterminate ? undefined : { width: `${Math.max(0, Math.min(100, percent))}%` }}
        />
      </div>

      <div className="progress-meta">
        <span>当前文件</span>
        <strong>{fileName || "准备中"}</strong>
      </div>
    </section>
  );
}

export default ProgressCard;
