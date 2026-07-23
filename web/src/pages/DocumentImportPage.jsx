import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageTopbar from "../components/PageTopbar";
import { runConversionPipeline, buildInitialDocuments, reconvertBySourceTypes } from "../pipeline/convertPipeline";
import { ParseStatus } from "../pipeline/documentModel";
import {
  buildMergedPreviewModel,
  createMergedPreviewSlice,
  DEFAULT_PREVIEW_SECTION_LIMIT,
} from "../preview/mergedPreviewModel";
import MergedPreview from "../preview/MergedPreview";
import {
  DEFAULT_IMAGE_DISPLAY_PRESET_ID,
  IMAGE_DISPLAY_PRESETS,
  getImageDisplayPreset,
  normalizeImageDisplayPresetId,
} from "../preview/imageDisplayPresets";
import {
  exportMergedPreviewToDocumentPath,
  getImageQualityPreset,
  prepareKaTeXForExport,
} from "../services/exportService";
import { jsPDF } from "jspdf";
import { transferBinaryToBridge } from "../services/binaryTransferService";
import MNBridge from "../lib/mnBridge";
import ProgressPopup from "../components/ProgressPopup";
import {
  buildConversionProgressModel,
  buildImportProgressModel,
} from "../progress/progressModel";
import useStagedProgressPercent from "../progress/useStagedProgressPercent";
import {
  buildAutoExportFileName,
  deleteFontAsset,
  deleteStylePreset,
  inferFontDraft,
  loadExportConfigBundle,
  readStylePreset,
  sanitizePdfFileName,
  saveStylePreset,
  completeImportWithNotice,
  showAlertMessage,
  uploadFontAsset,
} from "../services/exportConfigService";
import {
  buildFontRegistry,
  buildScopedThemeCss,
} from "../services/exportThemeService";
import { applyAdaptiveLayout } from "../services/widthAdaptService";
import {
  revokeAllObjectURLs,
  revokeObjectURLsForFiles,
} from "../parsers/objectUrlRegistry";
import EngineSettingsPopup from "../components/EngineSettingsPopup";
import { registerLegacyJsEngine } from "../engines/legacyJsEngine";
import { registerReamkitEngine } from "../engines/reamkitEngine";
import { getDefaultEngineId } from "../engines/engineRegistry";

let enginesInitialized = false;
function ensureEnginesInitialized() {
  if (!enginesInitialized) {
    enginesInitialized = true;
    registerLegacyJsEngine();
    registerReamkitEngine();
  }
}
function statusLabel(status) {
  if (status === ParseStatus.PENDING) return "待处理";
  if (status === ParseStatus.PROCESSING) return "处理中";
  if (status === ParseStatus.SUCCESS) return "成功";
  if (status === ParseStatus.ERROR) return "失败";
  return status;
}

function sourceTypeLabel(sourceType) {
  if (sourceType === "docx") return "Word (.docx)";
  if (sourceType === "doc") return "Word (.doc)";
  if (sourceType === "xlsx") return "Excel (.xlsx)";
  if (sourceType === "xls") return "Excel (.xls)";
  if (sourceType === "csv") return "CSV";
  if (sourceType === "pptx") return "PowerPoint (.pptx)";
  if (sourceType === "ppt") return "PowerPoint (.ppt)";
  if (sourceType === "rtf") return "RTF";
  if (sourceType === "markdown") return "Markdown";
  if (sourceType === "html") return "HTML";
  if (sourceType === "text") return "文本";
  if (sourceType === "epub") return "EPUB";
  if (sourceType === "image") return "图片";
  if (sourceType === "code") return "代码";
  if (sourceType === "unsupported") return "暂不支持";
  return sourceType || "未知类型";
}

function formatFileSize(size) {
  if (!Number.isFinite(size) || size <= 0) {
    return "0KB";
  }

  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)}MB`;
  }

  return `${Math.max(1, Math.round(size / 1024))}KB`;
}

function getFileIdentity(file) {
  return `${file.name}::${file.size}::${file.lastModified}`;
}

function mergeUniqueFiles(existingFiles, incomingFiles) {
  const seen = new Set(existingFiles.map(getFileIdentity));
  const addedFiles = [];

  incomingFiles.forEach((file) => {
    const identity = getFileIdentity(file);
    if (seen.has(identity)) {
      return;
    }

    seen.add(identity);
    addedFiles.push(file);
  });

  return {
    mergedFiles: existingFiles.concat(addedFiles),
  };
}

function formatFontLabel(font) {
  return `${font.family} · ${font.weight} · ${font.style}`;
}

function buildImportAlertMessage(saveError) {
  if (!saveError) {
    return "已导入到MN文档";
  }

  return `导入到MN文档失败\n${saveError.message}`;
}

async function notifyImportResult(saveError) {
  const message = buildImportAlertMessage(saveError);

  try {
    if (saveError) {
      await showAlertMessage(message);
    } else {
      await completeImportWithNotice(message);
    }
  } catch (error) {
    console.log(`[ImportEverything] show import alert failed: ${String(error)}`);
  }
}

const IMAGE_QUALITY_MIN = 1;
const IMAGE_QUALITY_MAX = 5;
const PREVIEW_ZOOM_MIN = 50;
const PREVIEW_ZOOM_MAX = 200;
const PREVIEW_ZOOM_STEP = 10;
const PREVIEW_PAGE_WIDTH = 794;
const IMPORT_QUALITY_JPEG_MAP = {
  1: 0.58,
  2: 0.68,
  3: 0.78,
  4: 0.86,
  5: 0.92,
};

function clampPreviewZoom(value) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    return 100;
  }

  return Math.max(PREVIEW_ZOOM_MIN, Math.min(PREVIEW_ZOOM_MAX, Math.round(normalized)));
}

function getImportJpegQuality(level) {
  return IMPORT_QUALITY_JPEG_MAP[level] || IMPORT_QUALITY_JPEG_MAP[3];
}

function buildImportSnapshotHtml(cssText, rootHtml, zoomLevel) {
  const normalizedZoom = clampPreviewZoom(zoomLevel);
  const zoomScale = normalizedZoom / 100;
  const bodyHtml = zoomScale === 1
    ? rootHtml
    : [
      `<div style="width:${PREVIEW_PAGE_WIDTH}px;zoom:${zoomScale};background:#ffffff;">`,
      rootHtml,
      "</div>",
    ].join("");

  return [
    "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><style>",
    cssText,
    "</style></head><body>",
    bodyHtml,
    "</body></html>",
  ].join("");
}

function FileQueue({
  files,
  documents,
  disabled,
  onMoveUp,
  onMoveDown,
  onRemove,
}) {
  if (files.length === 0) {
    return null;
  }

  return (
    <ul className="queue-list">
      {files.map((file, index) => {
        const document = documents[index];

        return (
          <li key={getFileIdentity(file)} className="queue-item">
            <div className="queue-meta">
              <strong>{file.name}</strong>
              <span>
                {sourceTypeLabel(document ? document.sourceType : "")} · {formatFileSize(file.size)}
              </span>
            </div>

            <div className="queue-actions">
              <button
                type="button"
                className="button button-ghost button-small"
                onClick={() => onMoveUp(index)}
                disabled={disabled || index === 0}
              >
                上移
              </button>
              <button
                type="button"
                className="button button-ghost button-small"
                onClick={() => onMoveDown(index)}
                disabled={disabled || index === files.length - 1}
              >
                下移
              </button>
              <button
                type="button"
                className="button button-danger button-small"
                onClick={() => onRemove(index)}
                disabled={disabled}
              >
                删除
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function DocumentStatusList({ documents, problemsOnly = false }) {
  const [expandedWarningIds, setExpandedWarningIds] = useState([]);
  const visibleDocuments = useMemo(
    () => (problemsOnly
      ? documents.filter((doc) => doc.parseStatus === ParseStatus.ERROR || (doc.warnings || []).length > 0)
      : documents),
    [documents, problemsOnly],
  );

  function toggleWarnings(docId) {
    setExpandedWarningIds((current) => (
      current.includes(docId)
        ? current.filter((id) => id !== docId)
        : current.concat(docId)
    ));
  }

  if (visibleDocuments.length === 0) {
    return <p className="muted-text">暂无异常或警告。</p>;
  }

  return (
    <div className="status-list">
      {visibleDocuments.map((doc) => {
        const warningCount = (doc.warnings || []).length;
        const warningsExpanded = expandedWarningIds.includes(doc.id);

        return (
          <article key={doc.id} className={`status-card status-${doc.parseStatus}`}>
            <header className="status-card-header">
              <h3>{doc.name}</h3>
              <span>{statusLabel(doc.parseStatus)}</span>
            </header>

            <p className="status-type">{sourceTypeLabel(doc.sourceType)}</p>

            {doc.error ? <p className="error-text">{doc.error.message}</p> : null}

            {warningCount > 0 ? (
              <div className="warning-block">
                <div className="warning-summary">
                  <span>{warningCount}条警告</span>
                  <button
                    type="button"
                    className="button button-ghost button-small"
                    onClick={() => toggleWarnings(doc.id)}
                  >
                    {warningsExpanded ? "收起警告" : "查看警告"}
                  </button>
                </div>

                {warningsExpanded ? (
                  <ul className="warning-list">
                    {doc.warnings.map((warning, index) => (
                      <li key={`${doc.id}-warning-${index}`}>{warning}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

function DocumentImportPage() {
  ensureEnginesInitialized();
  const navigate = useNavigate();
  const [step, setStep] = useState("select");
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [isConverting, setIsConverting] = useState(false);
  const [currentProgress, setCurrentProgress] = useState(null);
  const [showStatusDetails, setShowStatusDetails] = useState(false);
  const [showFullPreview, setShowFullPreview] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [lastSavedInfo, setLastSavedInfo] = useState(null);
  const [hasSaveAttempt, setHasSaveAttempt] = useState(false);
  const [conversionRunId, setConversionRunId] = useState(0);
  const [saveRunId, setSaveRunId] = useState(0);

  const [exportConfig, setExportConfig] = useState({
    loading: true,
    error: "",
    rootPath: "",
    styles: [],
    fonts: [],
  });
  const [activeStyleId, setActiveStyleId] = useState("");
  const [activeStyleMeta, setActiveStyleMeta] = useState(null);
  const [styleDraftName, setStyleDraftName] = useState("");
  const [styleDraftCss, setStyleDraftCss] = useState("");
  const [stylePickerOpen, setStylePickerOpen] = useState(false);
  const [settingsDrawerOpen, setSettingsDrawerOpen] = useState(false);
  const [styleBusy, setStyleBusy] = useState(false);
  const [styleMessage, setStyleMessage] = useState("");
  const [styleError, setStyleError] = useState("");
  const [fontBusy, setFontBusy] = useState(false);
  const [fontMessage, setFontMessage] = useState("");
  const [fontError, setFontError] = useState("");
  const [pendingFontFile, setPendingFontFile] = useState(null);
  const [pendingFontFamily, setPendingFontFamily] = useState("");
  const [pendingFontWeight, setPendingFontWeight] = useState(400);
  const [pendingFontStyle, setPendingFontStyle] = useState("normal");
  const [exportFileName, setExportFileName] = useState("ImportEverything.pdf");
  const [isExportFileNameDirty, setIsExportFileNameDirty] = useState(false);
  const [imageQualityLevel, setImageQualityLevel] = useState(3);
  const [imageDisplayPresetId, setImageDisplayPresetId] = useState(DEFAULT_IMAGE_DISPLAY_PRESET_ID);
  const [previewZoomLevel, setPreviewZoomLevel] = useState(100);
  const [previewZoomTouched, setPreviewZoomTouched] = useState(false);
  const [engineSelections, setEngineSelections] = useState({});
  const [enginePopupOpen, setEnginePopupOpen] = useState(false);
  const [previewBaseSize, setPreviewBaseSize] = useState({
    width: 0,
    height: 0,
  });

  const styleImportInputRef = useRef(null);
  const fontUploadInputRef = useRef(null);
  const stylePickerRef = useRef(null);
  const previewViewportRef = useRef(null);
  const previousSelectedFilesRef = useRef([]);

  const previewModel = useMemo(() => buildMergedPreviewModel(documents), [documents]);
  const compactPreviewModel = useMemo(
    () => createMergedPreviewSlice(previewModel, DEFAULT_PREVIEW_SECTION_LIMIT),
    [previewModel],
  );
  const activePreviewModel = showFullPreview ? previewModel : compactPreviewModel;

  const successCount = documents.filter((item) => item.parseStatus === ParseStatus.SUCCESS).length;
  const errorCount = documents.filter((item) => item.parseStatus === ParseStatus.ERROR).length;
  const warningCount = documents.reduce((sum, item) => sum + ((item.warnings || []).length), 0);
  const problemDocuments = documents.filter(
    (item) => item.parseStatus === ParseStatus.ERROR || (item.warnings || []).length > 0,
  );

  const conversionProgress = useMemo(
    () => buildConversionProgressModel({
      documents,
      progress: currentProgress,
      isActive: isConverting,
    }),
    [documents, currentProgress, isConverting],
  );
  const saveProgressModel = useMemo(
    () => buildImportProgressModel(saveProgress, exportFileName, isSaving),
    [saveProgress, exportFileName, isSaving],
  );
  const displayConversionPercent = useStagedProgressPercent({
    targetPercent: conversionProgress.targetPercent,
    stageCapPercent: conversionProgress.stageCapPercent,
    runId: conversionRunId,
    isActive: isConverting,
  });
  const displaySavePercent = useStagedProgressPercent({
    targetPercent: saveProgressModel ? saveProgressModel.targetPercent : 0,
    stageCapPercent: saveProgressModel ? saveProgressModel.stageCapPercent : 0,
    runId: saveRunId,
    isActive: isSaving,
  });
  const canStartConversion = selectedFiles.length > 0 && !isConverting;
  const canImportToMN = previewModel.totalContentSections > 0 && !isSaving;
  const fontRegistry = useMemo(
    () => buildFontRegistry(exportConfig.fonts),
    [exportConfig.fonts],
  );
  const activeStyleLabel = useMemo(() => {
    const matchedStyle = exportConfig.styles.find((style) => style.id === activeStyleId);
    if (!matchedStyle) {
      return exportConfig.loading ? "读取中" : "请选择样式";
    }
    return `${matchedStyle.name}${matchedStyle.builtin ? " · 内置" : ""}`;
  }, [exportConfig.styles, activeStyleId, exportConfig.loading]);
  const themeCssText = useMemo(
    () => buildScopedThemeCss({
      styleId: activeStyleId || "default",
      styleCss: styleDraftCss,
      fontRegistry,
    }),
    [activeStyleId, styleDraftCss, fontRegistry],
  );
  const activeImageQualityPreset = useMemo(
    () => getImageQualityPreset(imageQualityLevel),
    [imageQualityLevel],
  );
  const activeImageDisplayPreset = useMemo(
    () => getImageDisplayPreset(imageDisplayPresetId),
    [imageDisplayPresetId],
  );
  const previewZoomScale = previewZoomLevel / 100;
  const previewZoomShellStyle = previewBaseSize.height > 0
    ? {
      height: `${previewBaseSize.height * previewZoomScale}px`,
    }
    : undefined;
  const previewZoomStageStyle = previewBaseSize.height > 0
    ? {
      width: `${PREVIEW_PAGE_WIDTH}px`,
      transform: `scale(${previewZoomScale})`,
    }
    : {
      position: "static",
      width: `${PREVIEW_PAGE_WIDTH}px`,
      transform: `scale(${previewZoomScale})`,
    };

  useEffect(() => {
    if (isExportFileNameDirty) {
      return;
    }

    setExportFileName(buildAutoExportFileName(selectedFiles));
  }, [selectedFiles, isExportFileNameDirty]);

  useEffect(() => {
    window.__onPanelShow = () => {
      setImageQualityLevel(3);
      setImageDisplayPresetId(DEFAULT_IMAGE_DISPLAY_PRESET_ID);
      setPreviewZoomLevel(100);
      setPreviewZoomTouched(false);
    };

    return () => {
      if (window.__onPanelShow) {
        delete window.__onPanelShow;
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function refreshConfig() {
      setExportConfig((current) => ({
        ...current,
        loading: true,
        error: "",
      }));

      try {
        const nextConfig = await loadExportConfigBundle();
        if (cancelled) {
          return;
        }

        setExportConfig({
          loading: false,
          error: "",
          ...nextConfig,
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        setExportConfig((current) => ({
          ...current,
          loading: false,
          error: error && error.message ? error.message : String(error),
        }));
      }
    }

    refreshConfig();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (exportConfig.styles.length === 0) {
      setActiveStyleId("");
      return;
    }

    const hasActive = exportConfig.styles.some((style) => style.id === activeStyleId);
    if (!hasActive) {
      setActiveStyleId(exportConfig.styles[0].id);
    }
  }, [exportConfig.styles, activeStyleId]);

  useEffect(() => {
    if (!activeStyleId) {
      setActiveStyleMeta(null);
      setStyleDraftName("");
      setStyleDraftCss("");
      return undefined;
    }

    let cancelled = false;

    async function loadStyleDraft() {
      setStyleError("");
      try {
        const result = await readStylePreset(activeStyleId);
        if (cancelled) {
          return;
        }
        setActiveStyleMeta(result.style);
        setStyleDraftName(result.style.name);
        setStyleDraftCss(result.cssText);
      } catch (error) {
        if (cancelled) {
          return;
        }
        setStyleError(error && error.message ? error.message : String(error));
      }
    }

    loadStyleDraft();
    return () => {
      cancelled = true;
    };
  }, [activeStyleId]);

  useEffect(() => {
    if (!stylePickerOpen) {
      return undefined;
    }

    function handlePointerDown(event) {
      if (!stylePickerRef.current || stylePickerRef.current.contains(event.target)) {
        return;
      }
      setStylePickerOpen(false);
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setStylePickerOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [stylePickerOpen]);

  useEffect(() => {
    if (!settingsDrawerOpen) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setSettingsDrawerOpen(false);
        setStylePickerOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [settingsDrawerOpen]);

  useEffect(() => {
    if (step === "result") {
      return;
    }

    setSettingsDrawerOpen(false);
    setStylePickerOpen(false);
  }, [step]);

  useEffect(() => {
    if (step !== "result") {
      setPreviewBaseSize({
        width: 0,
        height: 0,
      });
      return undefined;
    }

    const rootElement = document.getElementById("result-preview-root");
    const viewportElement = previewViewportRef.current;
    if (!rootElement || !viewportElement) {
      return undefined;
    }

    const cleanupAdaptiveLayout = applyAdaptiveLayout(rootElement, {
      onMeasureError(info) {
        console.log(`[ImportEverything] preview width adapt failed: ${info.selector} - ${info.message}`);
      },
    });

    let frameId = 0;
    let resizeObserver = null;

    function measurePreviewLayout() {
      const rect = rootElement.getBoundingClientRect();
      const nextSize = {
        width: Math.max(0, Math.ceil(rootElement.scrollWidth || rect.width || 0)),
        height: Math.max(0, Math.ceil(rootElement.scrollHeight || rect.height || 0)),
      };

      setPreviewBaseSize((current) => (
        current.width === nextSize.width && current.height === nextSize.height
          ? current
          : nextSize
      ));
    }

    frameId = window.requestAnimationFrame(measurePreviewLayout);

    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        window.cancelAnimationFrame(frameId);
        frameId = window.requestAnimationFrame(measurePreviewLayout);
      });
      resizeObserver.observe(rootElement);
      resizeObserver.observe(viewportElement);
    }

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      window.cancelAnimationFrame(frameId);
      cleanupAdaptiveLayout();
    };
  }, [step, showFullPreview, styleDraftCss, fontRegistry, activePreviewModel, imageDisplayPresetId]);

  useEffect(() => {
    if (step !== "result" || previewZoomTouched || previewBaseSize.width <= 0) {
      return;
    }

    const viewportElement = previewViewportRef.current;
    if (!viewportElement) {
      return;
    }

    const availableWidth = Math.max(0, viewportElement.clientWidth - 12);
    if (availableWidth <= 0 || previewBaseSize.width <= availableWidth) {
      return;
    }

    const rawZoom = (availableWidth / previewBaseSize.width) * 100;
    const steppedZoom = Math.floor(rawZoom / PREVIEW_ZOOM_STEP) * PREVIEW_ZOOM_STEP;
    const nextZoom = clampPreviewZoom(Math.min(100, Math.max(PREVIEW_ZOOM_MIN, steppedZoom)));
    setPreviewZoomLevel((current) => (current === nextZoom ? current : nextZoom));
  }, [step, previewZoomTouched, previewBaseSize.width]);

  useEffect(() => {
    const previousFiles = previousSelectedFilesRef.current;
    const currentIds = new Set(selectedFiles.map(getFileIdentity));
    const removedFiles = previousFiles.filter((file) => !currentIds.has(getFileIdentity(file)));

    if (removedFiles.length > 0) {
      revokeObjectURLsForFiles(removedFiles);
    }

    previousSelectedFilesRef.current = selectedFiles;
  }, [selectedFiles]);

  useEffect(() => {
    const handler = function (msg) {
      setSaveProgress(function (prev) {
        if (!prev) return prev;
        return { ...prev, message: String(msg) };
      });
    };
    window.__bridgeProgress = handler;
    return function () {
      delete window.__bridgeProgress;
      revokeAllObjectURLs();
    };
  }, []);

  async function refreshExportConfig(preferredStyleId = activeStyleId) {
    setExportConfig((current) => ({
      ...current,
      loading: true,
      error: "",
    }));

    try {
      const nextConfig = await loadExportConfigBundle();
      setExportConfig({
        loading: false,
        error: "",
        ...nextConfig,
      });

      const hasPreferredStyle = nextConfig.styles.some((style) => style.id === preferredStyleId);
      if (hasPreferredStyle) {
        setActiveStyleId(preferredStyleId);
      } else if (nextConfig.styles.length > 0) {
        setActiveStyleId(nextConfig.styles[0].id);
      } else {
        setActiveStyleId("");
      }
    } catch (error) {
      setExportConfig((current) => ({
        ...current,
        loading: false,
        error: error && error.message ? error.message : String(error),
      }));
    }
  }

  function resetSaveState() {
    setIsSaving(false);
    setSaveProgress(null);
    setSaveError(null);
    setLastSavedInfo(null);
    setHasSaveAttempt(false);
  }

  function syncFiles(nextFiles) {
    setSelectedFiles(nextFiles);
    setDocuments(buildInitialDocuments(nextFiles));
    setStep("select");
    setIsConverting(false);
    setCurrentProgress(null);
    setShowStatusDetails(false);
    setShowFullPreview(false);
    resetSaveState();
    setIsExportFileNameDirty(false);
    setPreviewZoomLevel(100);
    setPreviewZoomTouched(false);
  }

  function appendFiles(incomingFiles) {
    if (!incomingFiles || incomingFiles.length === 0) {
      return;
    }

    const { mergedFiles } = mergeUniqueFiles(selectedFiles, incomingFiles);
    syncFiles(mergedFiles);
  }

  function onFileChange(event) {
    const files = Array.from(event.target.files || []);
    appendFiles(files);
    event.target.value = "";
  }

  function onDrop(event) {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files || []);
    appendFiles(files);
  }

  function onDragOver(event) {
    event.preventDefault();
  }

  function clearAll() {
    syncFiles([]);
  }

  function removeFileAt(index) {
    const nextFiles = selectedFiles.filter((_, fileIndex) => fileIndex !== index);
    syncFiles(nextFiles);
  }

  function moveFile(index, direction) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= selectedFiles.length) {
      return;
    }

    const nextFiles = [...selectedFiles];
    const currentFile = nextFiles[index];
    nextFiles[index] = nextFiles[targetIndex];
    nextFiles[targetIndex] = currentFile;
    syncFiles(nextFiles);
  }

  function returnToSelection() {
    setDocuments(buildInitialDocuments(selectedFiles));
    setStep("select");
    setIsConverting(false);
    setCurrentProgress(null);
    setShowStatusDetails(false);
    setShowFullPreview(false);
    resetSaveState();
    setPreviewZoomLevel(100);
    setPreviewZoomTouched(false);
  }

  async function startConversion() {
    if (!canStartConversion) {
      return;
    }

    setConversionRunId((value) => value + 1);
    setStep("converting");
    setIsConverting(true);
    setShowStatusDetails(false);
    setShowFullPreview(false);
    setPreviewZoomLevel(100);
    setPreviewZoomTouched(false);
    resetSaveState();
    setCurrentProgress({
      fileIndex: 0,
      totalFiles: selectedFiles.length,
      fileName: selectedFiles[0] ? selectedFiles[0].name : "",
      stage: "prepare",
      current: 0,
      total: 1,
      ratioHint: 0.08,
    });

    try {
      await runConversionPipeline(selectedFiles, {
        engineSelections,
        onDocumentsChange(nextDocs) {
          setDocuments(nextDocs);
        },
        onProgress(progress) {
          setCurrentProgress(progress);
        },
      });
    } finally {
      setIsConverting(false);
      setShowStatusDetails(false);
      setStep("result");
    }
  }

  function waitForImages(container) {
    const imgs = Array.from(container.querySelectorAll("img"));
    if (imgs.length === 0) return;
    return Promise.all(imgs.map(img => {
      if (img.complete && img.naturalWidth > 0) return;
      return new Promise(resolve => { img.onload = img.onerror = resolve; });
    }));
  }

  async function saveToDocumentPath() {
    if (!canImportToMN) {
      return;
    }

    setSaveRunId((value) => value + 1);
    setHasSaveAttempt(true);
    setIsSaving(true);
    setSaveError(null);
    setLastSavedInfo(null);
    let exportRoot = null;
    try {
      exportRoot = document.createElement("div");
      exportRoot.className = "merged-preview themed-document";
      exportRoot.dataset.exportThemeRoot = "true";
      exportRoot.dataset.exportStyleId = activeStyleId || "default";
      const presetId = String(imageDisplayPresetId || "fit-width").replace(/[^a-z0-9-]/g, "");
      exportRoot.dataset.imagePresetId = presetId;
      exportRoot.style.width = "794px";
      exportRoot.style.background = "#ffffff";
      previewModel.contentSections.forEach((section) => {
        const sectionEl = document.createElement("section");
        sectionEl.className = "print-block content-section";
        const h4 = document.createElement("h4");
        h4.textContent = section.title;
        sectionEl.appendChild(h4);
        const div = document.createElement("div");
        div.className = "content-html themed-content-html";
        div.innerHTML = section.html;
        sectionEl.appendChild(div);
        exportRoot.appendChild(sectionEl);
      });
      document.body.appendChild(exportRoot);
      prepareKaTeXForExport(exportRoot);
      await waitForImages(exportRoot);

      const cssLines = [
        "body{margin:0;background:#fff;font-family:-apple-system,'PingFang SC',sans-serif;font-size:13px;line-height:1.6;color:#182018}",
        ".content-html img{max-width:100%;height:auto;display:block}",
        ".content-html p,.content-html ul,.content-html ol{margin:1em 0}",
        ".content-html ul,.content-html ol{padding-left:1.5em}",
        ".content-section h4{margin-bottom:8px;font-size:15px;line-height:1.4}",
      ];
      if (typeof themeCssText === "string") cssLines.push(themeCssText);

      const PAGE_W = 794, PAGE_H = 1123;
      const pdf = new jsPDF({ orientation: "p", unit: "px", format: [PAGE_W, PAGE_H], compress: true });
      let firstPage = true;
      let captureSessionId = null;

      setSaveProgress({ phase: "snapshot", message: "正在生成PDF", current: 0, total: 1, ratioHint: 0.5, indeterminate: true });

      try {
        const snapshotHtml = buildImportSnapshotHtml(
          cssLines.join(""),
          exportRoot.outerHTML,
          previewZoomLevel,
        );
        const snapResult = await MNBridge.send("captureHtmlAsPdf", {
          html: snapshotHtml,
          pageWidth: 794,
          pageHeight: PAGE_H,
        });
        if (!snapResult || !snapResult.ok || !snapResult.data || !snapResult.data.sessionId || !snapResult.data.pageCount) {
          throw new Error(snapResult ? snapResult.message : "captureHtmlAsPdf failed");
        }

        captureSessionId = snapResult.data.sessionId;
        const capturedPageCount = Number(snapResult.data.pageCount);
        for (let pi = 0; pi < capturedPageCount; pi++) {
          setSaveProgress(function (p) { return { ...p, message: "正在截取页面 " + (pi + 1) + "/" + capturedPageCount }; });
          const pageResult = await MNBridge.send("captureHtmlPdfPage", {
            sessionId: captureSessionId,
            pageIndex: pi,
            jpegQuality: getImportJpegQuality(imageQualityLevel),
          });
          if (!pageResult || !pageResult.ok || !pageResult.data || !pageResult.data.data || !pageResult.data.width || !pageResult.data.height) {
            throw new Error(pageResult ? pageResult.message : "captureHtmlPdfPage failed at index " + pi);
          }

          if (firstPage) { firstPage = false; } else { pdf.addPage([PAGE_W, PAGE_H], "p"); }
          pdf.addImage("data:image/jpeg;base64," + pageResult.data.data, "JPEG", 0, 0, PAGE_W, PAGE_H, undefined, "FAST");
          if (capturedPageCount > 1) {
            setSaveProgress(function (p) { return { ...p, message: "正在排版PDF " + (pi + 1) + "/" + capturedPageCount }; });
          }
        }
      } finally {
        if (captureSessionId) {
          await MNBridge.send("finishCaptureHtmlAsPdf", {
            sessionId: captureSessionId,
          });
        }
      }

      setSaveProgress(function (p) { return { ...p, message: "正在传送到MarginNote" }; });
      const pdfBytes = new Uint8Array(pdf.output("arraybuffer"));
      const result = await transferBinaryToBridge({
        bytes: pdfBytes,
        fileName: sanitizePdfFileName(exportFileName),
        mimeType: "application/pdf",
        commands: { init: "savePdfInit", chunk: "savePdfChunk", finalize: "savePdfFinalize", abort: "savePdfAbort" },
        buildFinalizePayload: function (a) {
          return { sessionId: a.sessionId, totalChunks: a.totalChunks, expectedByteLength: a.expectedByteLength };
        },
      });

      setSaveProgress({ phase: "done", message: "导入完成", current: 1, total: 1, ratioHint: 1, indeterminate: false });
      setLastSavedInfo(result ? result.data : null);
      await notifyImportResult(null);
      navigate("/", { replace: true });
    } catch (error) {
      const nextSaveError = {
        command: error && error.command ? error.command : "unknown",
        chunkIndex:
          error && error.chunkIndex !== undefined && error.chunkIndex !== null
            ? error.chunkIndex
            : "n/a",
        message: error && error.message ? error.message : String(error),
      };
      setSaveError(nextSaveError);
      await notifyImportResult(nextSaveError);
    } finally {
      if (exportRoot && exportRoot.parentNode) {
        exportRoot.parentNode.removeChild(exportRoot);
      }
      setIsSaving(false);
    }
  }

  function adjustPreviewZoom(delta) {
    setPreviewZoomTouched(true);
    setPreviewZoomLevel((current) => clampPreviewZoom(current + delta));
  }

  function resetPreviewZoom() {
    setPreviewZoomTouched(true);
    setPreviewZoomLevel(100);
  }

  async function handleEngineChange(sourceType, engineId) {
    const nextSelections = { ...engineSelections, [sourceType]: engineId };
    setEngineSelections(nextSelections);
    setEnginePopupOpen(false);

    const filesToReconvert = selectedFiles.filter(
      (_, i) => documents[i] && documents[i].sourceType === sourceType
    );
    if (filesToReconvert.length === 0) return;

    try {
      setIsConverting(true);
      setCurrentProgress({
        fileIndex: 0,
        totalFiles: filesToReconvert.length,
        fileName: filesToReconvert[0].name,
        stage: "reconvert",
        current: 0,
        total: 1,
        ratioHint: 0.08,
      });

      const updatedDocs = await reconvertBySourceTypes(selectedFiles, documents, [sourceType], {
        engineSelections: nextSelections,
        onDocumentsChange(nextDocs) {
          setDocuments(nextDocs);
        },
        onProgress(progress) {
          setCurrentProgress(progress);
        },
      });
      setDocuments(updatedDocs);
    } finally {
      setIsConverting(false);
      setCurrentProgress(null);
    }
  }

  async function handleSaveStyle() {
    if (!styleDraftCss.trim()) {
      setStyleError("样式内容不能为空");
      return;
    }

    setStyleBusy(true);
    setStyleError("");
    setStyleMessage("");

    try {
      const shouldCreateNew = !activeStyleMeta || activeStyleMeta.builtin === true;
      const result = await saveStylePreset({
        id: shouldCreateNew ? undefined : activeStyleMeta.id,
        name: styleDraftName || (activeStyleMeta ? `${activeStyleMeta.name}副本` : "新样式"),
        cssText: styleDraftCss,
      });

      setStyleMessage(shouldCreateNew ? "已保存为新样式" : "样式已保存");
      await refreshExportConfig(result.style.id);
    } catch (error) {
      setStyleError(error && error.message ? error.message : String(error));
    } finally {
      setStyleBusy(false);
    }
  }

  async function handleDuplicateStyle() {
    setStyleBusy(true);
    setStyleError("");
    setStyleMessage("");

    try {
      const result = await saveStylePreset({
        name: `${styleDraftName || (activeStyleMeta ? activeStyleMeta.name : "新样式")}副本`,
        cssText: styleDraftCss,
      });
      setStyleMessage("已创建新样式");
      await refreshExportConfig(result.style.id);
    } catch (error) {
      setStyleError(error && error.message ? error.message : String(error));
    } finally {
      setStyleBusy(false);
    }
  }

  async function handleDeleteStyle() {
    if (!activeStyleMeta || activeStyleMeta.builtin) {
      return;
    }

    setStyleBusy(true);
    setStyleError("");
    setStyleMessage("");

    try {
      await deleteStylePreset(activeStyleMeta.id);
      await refreshExportConfig();
    } catch (error) {
      setStyleError(error && error.message ? error.message : String(error));
    } finally {
      setStyleBusy(false);
    }
  }

  async function handleImportStyle(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setStyleBusy(true);
    setStyleError("");
    setStyleMessage("");

    try {
      const cssText = await file.text();
      const styleName = file.name.replace(/\.[^.]+$/, "") || "导入样式";
      const result = await saveStylePreset({
        name: styleName,
        cssText,
      });
      setStyleMessage("CSS已导入为新样式");
      await refreshExportConfig(result.style.id);
    } catch (error) {
      setStyleError(error && error.message ? error.message : String(error));
    } finally {
      setStyleBusy(false);
    }
  }

  function handleChooseFontFile(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    const draft = inferFontDraft(file);
    setPendingFontFile(file);
    setPendingFontFamily(draft.family);
    setPendingFontWeight(draft.weight);
    setPendingFontStyle(draft.style);
    setFontError("");
    setFontMessage("");
  }

  async function handleUploadFont() {
    if (!pendingFontFile) {
      setFontError("请先选择字体文件");
      return;
    }

    setFontBusy(true);
    setFontError("");
    setFontMessage("");

    try {
      await uploadFontAsset({
        file: pendingFontFile,
        family: pendingFontFamily,
        weight: pendingFontWeight,
        style: pendingFontStyle,
        onProgress(progress) {
          setFontMessage(progress.message || "正在上传字体");
        },
      });

      setFontMessage("字体上传完成");
      setPendingFontFile(null);
      await refreshExportConfig(activeStyleId);
    } catch (error) {
      setFontError(error && error.message ? error.message : String(error));
    } finally {
      setFontBusy(false);
    }
  }

  async function handleDeleteFont(fontId) {
    setFontBusy(true);
    setFontError("");
    setFontMessage("");

    try {
      await deleteFontAsset(fontId);
      setFontMessage("字体已移入回收区");
      await refreshExportConfig(activeStyleId);
    } catch (error) {
      setFontError(error && error.message ? error.message : String(error));
    } finally {
      setFontBusy(false);
    }
  }

  function handleSelectStyle(styleId) {
    setActiveStyleId(styleId);
    setStylePickerOpen(false);
  }

  function openSettingsDrawer() {
    setSettingsDrawerOpen(true);
  }

  function closeSettingsDrawer() {
    setSettingsDrawerOpen(false);
    setStylePickerOpen(false);
  }

  const exportSettingsContent = (
    <div className="export-settings-card">
      <div className="detail-head">
        <div>
          <h2>导入设置</h2>
        </div>
        {exportConfig.loading ? <span className="count-badge">读取中</span> : null}
      </div>

      {exportConfig.error ? <p className="error-text">{exportConfig.error}</p> : null}

      <div className="settings-block">
        <label className="field-label" htmlFor="export-file-name">PDF名称</label>
        <input
          id="export-file-name"
          className="text-input"
          value={exportFileName}
          onChange={(event) => {
            setExportFileName(event.target.value);
            setIsExportFileNameDirty(true);
          }}
          onBlur={() => setExportFileName((current) => sanitizePdfFileName(current))}
          placeholder="输入导入PDF名称"
        />
      </div>

      <div className="settings-block">
        <div className="quality-slider-head">
          <label className="field-label" htmlFor="export-quality-slider">导入质量</label>
          <span className="quality-slider-value">{activeImageQualityPreset.label}</span>
        </div>
        <input
          id="export-quality-slider"
          className="quality-slider-range"
          type="range"
          min={IMAGE_QUALITY_MIN}
          max={IMAGE_QUALITY_MAX}
          step="1"
          value={imageQualityLevel}
          onChange={(event) => setImageQualityLevel(Number(event.target.value))}
        />
        <div className="quality-slider-hint-row">
          <span className="field-hint">更小更快</span>
          <span className="field-hint">更清晰更大</span>
        </div>
      </div>

      <div className="settings-block">
        <div className="quality-slider-head">
          <label className="field-label">图片尺寸</label>
          <span className="quality-slider-value">{activeImageDisplayPreset.label}</span>
        </div>
        <div className="image-preset-grid" role="group" aria-label="图片尺寸预设">
          {IMAGE_DISPLAY_PRESETS.map((preset) => {
            const selected = preset.id === imageDisplayPresetId;
            return (
              <button
                key={preset.id}
                type="button"
                className={`image-preset-option ${selected ? "image-preset-option-selected" : ""}`}
                onClick={() => setImageDisplayPresetId(normalizeImageDisplayPresetId(preset.id))}
                aria-pressed={selected ? "true" : "false"}
              >
                <strong>{preset.label}</strong>
                <span>{preset.description}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="settings-block">
        <div className="field-row">
          <label className="field-label">转换引擎</label>
          <button
            type="button"
            className="button button-ghost button-small"
            onClick={() => setEnginePopupOpen(true)}
            disabled={isConverting}
          >
            设置
          </button>
        </div>
        <p className="muted-text">按扩展名切换文档转换引擎，部分格式支持 ReamKit 或内置引擎。</p>
      </div>

      <div className="settings-block">
        <div className="field-row">
          <label className="field-label">样式预设</label>
          <div className="card-actions">
            <button
              type="button"
              className="button button-ghost button-small"
              onClick={handleDuplicateStyle}
              disabled={styleBusy || !styleDraftCss}
            >
              新建样式
            </button>
            <button
              type="button"
              className="button button-ghost button-small"
              onClick={() => styleImportInputRef.current && styleImportInputRef.current.click()}
              disabled={styleBusy}
            >
              导入CSS
            </button>
          </div>
        </div>

        <input
          ref={styleImportInputRef}
          type="file"
          accept=".css,text/css"
          className="hidden-input"
          onChange={handleImportStyle}
        />

        <div
          ref={stylePickerRef}
          className={`style-picker ${stylePickerOpen ? "style-picker-open" : ""}`}
        >
          <button
            type="button"
            className="style-picker-trigger"
            onClick={() => {
              if (exportConfig.loading || exportConfig.styles.length === 0) {
                return;
              }
              setStylePickerOpen((current) => !current);
            }}
            disabled={exportConfig.loading || exportConfig.styles.length === 0}
            aria-haspopup="listbox"
            aria-expanded={stylePickerOpen ? "true" : "false"}
          >
            <span>{activeStyleLabel}</span>
            <span className="style-picker-caret">{stylePickerOpen ? "▲" : "▼"}</span>
          </button>

          {stylePickerOpen ? (
            <div className="style-picker-menu" role="listbox" aria-label="样式预设">
              {exportConfig.styles.map((style) => {
                const selected = style.id === activeStyleId;
                return (
                  <button
                    key={style.id}
                    type="button"
                    role="option"
                    aria-selected={selected ? "true" : "false"}
                    className={`style-picker-option ${selected ? "style-picker-option-selected" : ""}`}
                    onClick={() => handleSelectStyle(style.id)}
                  >
                    <span>{style.name}</span>
                    <span className="style-picker-tag">{style.builtin ? "内置" : "用户"}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        <input
          className="text-input"
          value={styleDraftName}
          onChange={(event) => setStyleDraftName(event.target.value)}
          placeholder="样式名称"
        />

        <textarea
          className="style-editor"
          value={styleDraftCss}
          onChange={(event) => setStyleDraftCss(event.target.value)}
          spellCheck={false}
          placeholder="在这里编辑CSS样式"
        />

        <div className="card-actions">
          <button
            type="button"
            className="button button-primary"
            onClick={handleSaveStyle}
            disabled={styleBusy || !styleDraftCss}
          >
            {activeStyleMeta && activeStyleMeta.builtin ? "另存为新样式" : "保存样式"}
          </button>
          <button
            type="button"
            className="button button-danger"
            onClick={handleDeleteStyle}
            disabled={styleBusy || !activeStyleMeta || activeStyleMeta.builtin}
          >
            删除样式
          </button>
        </div>

        {styleMessage ? <p className="success-text">{styleMessage}</p> : null}
        {styleError ? <p className="error-text">{styleError}</p> : null}
      </div>

      <div className="settings-block">
        <div className="field-row">
          <label className="field-label">字体库</label>
          <button
            type="button"
            className="button button-ghost button-small"
            onClick={() => fontUploadInputRef.current && fontUploadInputRef.current.click()}
            disabled={fontBusy}
          >
            选择字体
          </button>
        </div>

        <input
          ref={fontUploadInputRef}
          type="file"
          accept=".ttf,.otf,.woff,.woff2"
          className="hidden-input"
          onChange={handleChooseFontFile}
        />

        {pendingFontFile ? (
          <div className="font-upload-draft">
            <p className="muted-text">待上传: {pendingFontFile.name}</p>
            <input
              className="text-input"
              value={pendingFontFamily}
              onChange={(event) => setPendingFontFamily(event.target.value)}
              placeholder="字体家族名"
            />
            <div className="field-split">
              <input
                className="text-input"
                type="number"
                min="100"
                max="900"
                step="100"
                value={pendingFontWeight}
                onChange={(event) => setPendingFontWeight(Number(event.target.value || 400))}
              />
              <select
                className="text-input"
                value={pendingFontStyle}
                onChange={(event) => setPendingFontStyle(event.target.value)}
              >
                <option value="normal">normal</option>
                <option value="italic">italic</option>
              </select>
            </div>
            <button
              type="button"
              className="button button-primary"
              onClick={handleUploadFont}
              disabled={fontBusy}
            >
              上传字体
            </button>
          </div>
        ) : null}

        {exportConfig.fonts.length === 0 ? (
          <p className="muted-text">暂无自定义字体。</p>
        ) : (
          <ul className="asset-list">
            {exportConfig.fonts.map((font) => (
              <li key={font.id} className="asset-item">
                <div className="asset-meta">
                  <strong>{formatFontLabel(font)}</strong>
                  <span>{font.fileName}</span>
                </div>
                <button
                  type="button"
                  className="button button-danger button-small"
                  onClick={() => handleDeleteFont(font.id)}
                  disabled={fontBusy}
                >
                  删除
                </button>
              </li>
            ))}
          </ul>
        )}

        {fontMessage ? <p className="success-text">{fontMessage}</p> : null}
        {fontError ? <p className="error-text">{fontError}</p> : null}
      </div>
    </div>
  );

  return (
    <div className={`app-shell${step === "result" ? " step-result" : ""}`}>
      {step !== "result" ? (
        <PageTopbar label="文档导入" onBack={() => navigate("/")} />
      ) : null}
      {themeCssText ? <style>{themeCssText}</style> : null}

      <main className="shell-content">
        {step === "select" ? (
          <section className="surface">
            <div className="section-head">
              <div>
                <h2>准备文件</h2>
              </div>
              <span className="count-badge">{selectedFiles.length}个文件</span>
            </div>

            <label
              htmlFor="file-input"
              className="upload-dropzone"
              onDrop={onDrop}
              onDragOver={onDragOver}
            >
              <input
                id="file-input"
                type="file"
                multiple
                onChange={onFileChange}
              />
              <span className="dropzone-title">点击选择或拖入文件</span>
              <small>Office、EPUB、代码、图片、Markdown、HTML...</small>
            </label>

            <FileQueue
              files={selectedFiles}
              documents={documents}
              disabled={isConverting}
              onMoveUp={(index) => moveFile(index, -1)}
              onMoveDown={(index) => moveFile(index, 1)}
              onRemove={removeFileAt}
            />
          </section>
        ) : null}

        {step === "converting" ? (
          <section className="surface">
            <div className="summary-row">
              <span>{documents.length}个文件</span>
              <span>{successCount}个成功</span>
              <span>{errorCount}个失败</span>
            </div>

            <div className="detail-block">
              <div className="detail-head">
                <h2>文件明细</h2>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setShowStatusDetails((value) => !value)}
                >
                  {showStatusDetails ? "收起明细" : "展开明细"}
                </button>
              </div>

              {showStatusDetails ? <DocumentStatusList documents={documents} /> : null}
            </div>
          </section>
        ) : null}

        {step === "result" ? (
          <section className="surface result-surface result-layout">
            <div className="result-toolbar">
              <div className="summary-row">
                <span>{successCount}个成功</span>
                <span>{errorCount}个失败</span>
                <span>{previewModel.totalContentSections}段正文</span>
              </div>

              <div className="card-actions">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={openSettingsDrawer}
                >
                  导入设置
                </button>
                {compactPreviewModel.hasHiddenContentSections ? (
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => setShowFullPreview((value) => !value)}
                  >
                    {showFullPreview ? "收起到精简预览" : "展开全部预览"}
                  </button>
                ) : null}
              </div>
            </div>

            {hasSaveAttempt ? (
              <div className="save-status-block">
                {saveError ? (
                  <p className="error-text">
                    导入失败: command={saveError.command}, chunkIndex={saveError.chunkIndex}, message={saveError.message}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="result-fixed-headers">
              <div className="preview-stage-head">
                <div className="preview-stage-title">
                  <h2>正文预览</h2>
                </div>

                <div className="preview-stage-tools">
                  <div className="preview-zoom-control">
                    <span className="preview-zoom-label">缩放</span>
                    <button
                      type="button"
                      className="button button-ghost button-small"
                      onClick={() => adjustPreviewZoom(-PREVIEW_ZOOM_STEP)}
                      disabled={previewZoomLevel <= PREVIEW_ZOOM_MIN}
                    >
                      缩小
                    </button>
                    <input
                      className="preview-zoom-range"
                      type="range"
                      min={PREVIEW_ZOOM_MIN}
                      max={PREVIEW_ZOOM_MAX}
                      step={PREVIEW_ZOOM_STEP}
                      value={previewZoomLevel}
                      onChange={(event) => {
                        setPreviewZoomTouched(true);
                        setPreviewZoomLevel(clampPreviewZoom(event.target.value));
                      }}
                      aria-label="调整预览缩放"
                    />
                    <button
                      type="button"
                      className="button button-ghost button-small"
                      onClick={() => adjustPreviewZoom(PREVIEW_ZOOM_STEP)}
                      disabled={previewZoomLevel >= PREVIEW_ZOOM_MAX}
                    >
                      放大
                    </button>
                    <button
                      type="button"
                      className="button button-secondary button-small"
                      onClick={resetPreviewZoom}
                      disabled={previewZoomLevel === 100}
                    >
                      100%
                    </button>
                    <span className="preview-zoom-value">{previewZoomLevel}%</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="result-scroll-wrap" ref={previewViewportRef}>
              <div className="result-page-topbar">
                <button
                  type="button"
                  className="button button-ghost button-small"
                  onClick={returnToSelection}
                >
                  ← 文档导入
                </button>
              </div>

              <div className="preview-stage-body">
                <div className="preview-zoom-shell" style={previewZoomShellStyle}>
                  <div
                    className="preview-zoom-stage"
                    style={previewZoomStageStyle}
                  >
                    <MergedPreview
                      model={activePreviewModel}
                      variant="panel"
                      rootId="result-preview-root"
                      emptyText="没有成功转换的正文内容。"
                      styleId={activeStyleId || "default"}
                      imagePresetId={imageDisplayPresetId}
                    />
                  </div>
                </div>
              </div>

              {problemDocuments.length > 0 ? (
                <div className="detail-block">
                  <div className="detail-head">
                    <div>
                      <h2>异常与警告</h2>
                      <p>{errorCount}个失败，{warningCount}条警告</p>
                    </div>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => setShowStatusDetails((value) => !value)}
                    >
                      {showStatusDetails ? "收起" : "展开"}
                    </button>
                  </div>

                  {showStatusDetails ? (
                    <DocumentStatusList documents={documents} problemsOnly />
                  ) : null}
                </div>
              ) : null}
            </div>
          </section>
        ) : null}
      </main>

      <footer className="action-bar">
        {step === "select" ? (
          <>
            <button
              type="button"
              className="button button-secondary"
              onClick={clearAll}
              disabled={selectedFiles.length === 0}
            >
              清空
            </button>
            <button
              type="button"
              className="button button-primary button-grow"
              onClick={startConversion}
              disabled={!canStartConversion}
            >
              开始转换
            </button>
          </>
        ) : null}

        {step === "converting" ? (
          <>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setShowStatusDetails((value) => !value)}
            >
              {showStatusDetails ? "收起明细" : "展开明细"}
            </button>
            <button type="button" className="button button-primary button-grow" disabled>
              转换中
            </button>
          </>
        ) : null}

        {step === "result" ? (
          <>
            <button
              type="button"
              className="button button-secondary"
              onClick={returnToSelection}
              disabled={isSaving}
            >
              重新选择文件
            </button>
            <button
              type="button"
              className="button button-primary button-grow"
              onClick={saveToDocumentPath}
              disabled={!canImportToMN}
            >
              {isSaving ? "导入中" : saveError ? "重试导入到MN文档" : "导入到MN文档"}
            </button>
          </>
        ) : null}
      </footer>

      {step === "converting" && conversionProgress ? (
        <ProgressPopup
          title="正在转换文档"
          description={`已完成${conversionProgress.completedFiles}/${conversionProgress.totalFiles}个文件`}
          percent={displayConversionPercent}
          fileName={conversionProgress.fileName}
          actionLabel={conversionProgress.actionLabel}
        />
      ) : null}

      {isSaving && saveProgressModel ? (
        <ProgressPopup
          title="正在导入到MN文档"
          percent={displaySavePercent}
          fileName={saveProgressModel.fileName}
          message={saveProgressModel.message}
          indeterminate={saveProgressModel.indeterminate === true}
        />
      ) : null}

      {step === "result" ? (
        <div className={`drawer-layer ${settingsDrawerOpen ? "drawer-layer-open" : ""}`}>
          <button
            type="button"
            className="drawer-backdrop"
            aria-label="关闭导入设置"
            onClick={closeSettingsDrawer}
          />
          <aside
            className={`drawer-panel ${settingsDrawerOpen ? "drawer-panel-open" : ""}`}
            aria-hidden={settingsDrawerOpen ? "false" : "true"}
          >
            <button
              type="button"
              className="drawer-close-side"
              onClick={closeSettingsDrawer}
              aria-label="关闭导入设置"
            >
              <span className="drawer-close-side-icon">✕</span>
            </button>
            <div className="drawer-inner">
              <div className="drawer-head" onClick={closeSettingsDrawer}>
                <div className="drawer-head-left">
                  <span className="drawer-chevron">❮</span>
                  <h2>导入设置</h2>
                </div>
              </div>
              <div className="drawer-body">
                {exportSettingsContent}
              </div>
            </div>
          </aside>
        </div>
      ) : null}

      {enginePopupOpen ? (
        <EngineSettingsPopup
          documents={documents}
          engineSelections={engineSelections}
          onApply={handleEngineChange}
          onClose={() => setEnginePopupOpen(false)}
        />
      ) : null}
    </div>
  );
}

export default DocumentImportPage;
