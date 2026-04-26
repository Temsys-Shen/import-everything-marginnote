import { useEffect, useState } from "react";

function clampPercent(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, value));
}

export default function useStagedProgressPercent({
  targetPercent,
  stageCapPercent,
  runId,
  isActive,
  holdGap = 1.2,
}) {
  const normalizedTargetPercent = clampPercent(targetPercent);
  const normalizedStageCapPercent = clampPercent(
    Number.isFinite(stageCapPercent) ? stageCapPercent : normalizedTargetPercent,
  );
  const [displayPercent, setDisplayPercent] = useState(normalizedTargetPercent);

  useEffect(() => {
    setDisplayPercent(0);
  }, [runId]);

  useEffect(() => {
    let frameId = 0;

    const tick = () => {
      setDisplayPercent((previous) => {
        const stageHoldingPercent = Math.max(0, normalizedStageCapPercent - holdGap);
        const desiredPercent = isActive && normalizedTargetPercent < normalizedStageCapPercent
          ? Math.max(normalizedTargetPercent, stageHoldingPercent)
          : normalizedTargetPercent;

        if (desiredPercent <= previous) {
          return previous;
        }

        const gap = desiredPercent - previous;
        const step = Math.max(0.18, Math.min(1.6, gap * 0.08));
        const next = Math.min(desiredPercent, previous + step);

        if (next < desiredPercent) {
          frameId = window.requestAnimationFrame(tick);
        }

        return next;
      });
    };

    frameId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [holdGap, isActive, normalizedStageCapPercent, normalizedTargetPercent, runId]);

  return displayPercent;
}
