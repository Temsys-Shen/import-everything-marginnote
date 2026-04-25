const CONVERSION_STAGE_META = {
  prepare: {
    label: "准备转换",
    ratio: 0.08,
  },
  parse: {
    label: "解析内容",
    ratio: 0.36,
  },
  "parse-epub": {
    label: "解析EPUB",
    start: 0.18,
    end: 0.78,
  },
  "parse-pptx": {
    label: "解析演示文稿",
    ratio: 0.3,
  },
  "render-pptx": {
    label: "渲染页面",
    start: 0.48,
    end: 0.88,
  },
  complete: {
    label: "转换完成",
    ratio: 1,
  },
};

const IMPORT_PHASE_META = {
  idle: {
    label: "等待导入",
    ratio: 0,
  },
  render: {
    label: "生成PDF",
    ratio: 0.55,
  },
  transfer: {
    label: "写入MN文档",
    start: 0.55,
    end: 0.95,
  },
  done: {
    label: "导入完成",
    ratio: 1,
  },
};

function clampRatio(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

function normalizeFraction(current, total) {
  if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 0) {
    return null;
  }

  return clampRatio(current / total);
}

function interpolate(start, end, fraction) {
  return start + (end - start) * clampRatio(fraction);
}

export function getConversionStageMeta(stage) {
  return CONVERSION_STAGE_META[stage] || CONVERSION_STAGE_META.parse;
}

export function getConversionProgressRatio(progress) {
  if (!progress) {
    return 0;
  }

  if (Number.isFinite(progress.ratioHint)) {
    return clampRatio(progress.ratioHint);
  }

  const stageMeta = getConversionStageMeta(progress.stage);
  const fraction = normalizeFraction(progress.current, progress.total);

  if (fraction !== null && Number.isFinite(stageMeta.start) && Number.isFinite(stageMeta.end)) {
    return interpolate(stageMeta.start, stageMeta.end, fraction);
  }

  return clampRatio(stageMeta.ratio);
}

export function enrichConversionProgress(progress, totalFiles) {
  const normalized = progress || {};
  const stage = normalized.stage || "parse";
  const ratioHint = getConversionProgressRatio({ ...normalized, stage });

  return {
    fileIndex: Number.isFinite(normalized.fileIndex) ? normalized.fileIndex : 0,
    totalFiles: Number.isFinite(totalFiles) ? totalFiles : 0,
    fileName: normalized.fileName || "",
    stage,
    current: Number.isFinite(normalized.current) ? normalized.current : 0,
    total: Number.isFinite(normalized.total) ? normalized.total : 1,
    ratioHint,
    sourceType: normalized.sourceType || "",
  };
}

export function buildConversionProgressModel({ documents, progress, isActive }) {
  const totalFiles = documents.length;
  const completedFiles = documents.filter(
    (doc) => doc.parseStatus === "success" || doc.parseStatus === "error",
  ).length;

  if (totalFiles === 0) {
    return {
      targetPercent: 0,
      actionLabel: "准备转换",
      fileName: "",
      completedFiles: 0,
      totalFiles: 0,
    };
  }

  const normalized = progress ? enrichConversionProgress(progress, totalFiles) : null;
  const processingDoc = documents.find((doc) => doc.parseStatus === "processing") || null;
  const actionLabel = normalized
    ? getConversionStageMeta(normalized.stage).label
    : isActive
      ? "准备转换"
      : "转换完成";
  const fileName = normalized && normalized.fileName
    ? normalized.fileName
    : processingDoc
      ? processingDoc.name
      : "";

  let ratio = completedFiles / totalFiles;
  if (isActive && completedFiles < totalFiles) {
    const inFlightRatio = normalized ? getConversionProgressRatio(normalized) : 0;
    ratio = (completedFiles + inFlightRatio) / totalFiles;
  }

  if (completedFiles >= totalFiles) {
    ratio = 1;
  } else {
    ratio = clampRatio(isActive ? Math.min(ratio, 0.95) : ratio);
  }

  return {
    targetPercent: ratio * 100,
    actionLabel,
    fileName,
    completedFiles,
    totalFiles,
  };
}

export function getImportPhaseMeta(phase) {
  return IMPORT_PHASE_META[phase] || IMPORT_PHASE_META.render;
}

export function buildImportProgressModel(progress, fileName, isActive) {
  if (!progress && !isActive) {
    return null;
  }

  const normalized = progress || {
    phase: "idle",
    current: 0,
    total: 1,
    ratioHint: 0,
    message: "",
  };

  const phaseMeta = getImportPhaseMeta(normalized.phase);
  const fraction = normalizeFraction(normalized.current, normalized.total);
  let ratio = 0;

  if (Number.isFinite(normalized.ratioHint)) {
    ratio = clampRatio(normalized.ratioHint);
  } else if (fraction !== null && Number.isFinite(phaseMeta.start) && Number.isFinite(phaseMeta.end)) {
    ratio = interpolate(phaseMeta.start, phaseMeta.end, fraction);
  } else {
    ratio = clampRatio(phaseMeta.ratio);
  }

  if (normalized.phase === "done") {
    ratio = 1;
  } else {
    ratio = clampRatio(isActive ? Math.min(ratio, 0.95) : ratio);
  }

  return {
    targetPercent: ratio * 100,
    actionLabel: phaseMeta.label,
    fileName,
    message: normalized.message || phaseMeta.label,
  };
}

export function formatPercent(value) {
  return `${Math.round(clampRatio(value / 100) * 100)}%`;
}
