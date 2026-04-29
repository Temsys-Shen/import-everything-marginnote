import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageTopbar from "../components/PageTopbar";
import ProgressCard from "../components/ProgressCard";
import MindmapCanvasPreview from "../mindmap/MindmapCanvasPreview";
import { buildMindmapImportPreview } from "../mindmap/model";
import { detectMindmapSourceType, parseMindmapFileBySourceType } from "../mindmap/sourceTypes";
import { buildMindmapImportProgressModel } from "../progress/progressModel";
import { showAlertMessage } from "../services/exportConfigService";
import {
  getMindmapImportContext,
  getMindmapImportProgress,
  getMindmapImportResult,
  startMindmapImport,
} from "../services/mindmapImportService";

const MINDMAP_IMPORT_POLL_MS = 120;

function buildImportSuccessText(result) {
  const count = Number(result && result.createdCount ? result.createdCount : 0);
  if (count <= 0) {
    return "脑图导入已完成";
  }
  return `脑图导入完成，共创建${count}个节点`;
}

function collectPreviewSheetIds(preview) {
  if (!preview || !Array.isArray(preview.sheets)) {
    return [];
  }
  return preview.sheets.map((sheet) => String(sheet.id || "")).filter(Boolean);
}

function MindmapImportPage() {
  const navigate = useNavigate();
  const sheetPickerRef = useRef(null);
  const [step, setStep] = useState("select");
  const [contextState, setContextState] = useState({
    loading: true,
    error: "",
    value: null,
  });
  const [selectedFile, setSelectedFile] = useState(null);
  const [parseState, setParseState] = useState({
    loading: false,
    error: "",
    tree: null,
  });
  const [importState, setImportState] = useState({
    loading: false,
    error: "",
    message: "",
  });
  const [importProgress, setImportProgress] = useState(null);
  const [activeSheetId, setActiveSheetId] = useState("");
  const [selectedSheetIds, setSelectedSheetIds] = useState([]);
  const [sheetPickerOpen, setSheetPickerOpen] = useState(false);
  const importPollTimerRef = useRef(null);
  const importTaskIdRef = useRef("");

  function clearImportPolling() {
    if (importPollTimerRef.current) {
      window.clearTimeout(importPollTimerRef.current);
      importPollTimerRef.current = null;
    }
    importTaskIdRef.current = "";
  }

  useEffect(() => {
    let cancelled = false;

    async function loadContext() {
      try {
        const result = await getMindmapImportContext();
        if (cancelled) {
          return;
        }
        setContextState({
          loading: false,
          error: "",
          value: result,
        });
      } catch (error) {
        if (cancelled) {
          return;
        }
        setContextState({
          loading: false,
          error: error && error.message ? error.message : String(error),
          value: null,
        });
      }
    }

    loadContext();
    return () => {
      cancelled = true;
      clearImportPolling();
    };
  }, []);

  const preview = useMemo(
    () => (parseState.tree ? buildMindmapImportPreview(parseState.tree) : null),
    [parseState.tree],
  );
  const isMarkdownPreview = preview && preview.tree && preview.tree.sourceType === "markdown";

  const activeSheet = useMemo(() => {
    if (!preview || preview.sheets.length === 0) {
      return null;
    }
    return preview.sheets.find((sheet) => sheet.id === activeSheetId) || preview.sheets[0];
  }, [activeSheetId, preview]);

  const activeSheetLabel = useMemo(() => {
    if (!preview || preview.sheets.length === 0) {
      return "";
    }

    const selectedSheet = activeSheet || preview.sheets[0];
    const selectedIndex = preview.sheets.findIndex((sheet) => sheet.id === selectedSheet.id);
    return `Sheet ${selectedIndex + 1} · ${selectedSheet.title}`;
  }, [activeSheet, preview]);

  const importProgressModel = useMemo(
    () => buildMindmapImportProgressModel(importProgress, selectedFile ? selectedFile.name : "", importState.loading),
    [importProgress, importState.loading, selectedFile],
  );

  useEffect(() => {
    if (!sheetPickerOpen) {
      return undefined;
    }

    function handlePointerDown(event) {
      if (!sheetPickerRef.current || sheetPickerRef.current.contains(event.target)) {
        return;
      }
      setSheetPickerOpen(false);
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setSheetPickerOpen(false);
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
  }, [sheetPickerOpen]);

  useEffect(() => {
    setSheetPickerOpen(false);
  }, [step, preview, activeSheetId]);

  async function handleFileSelection(file) {
    clearImportPolling();
    setSelectedFile(file);
    setImportState({
      loading: false,
      error: "",
      message: "",
    });
    setImportProgress(null);

    if (!file) {
      setStep("select");
      setParseState({
        loading: false,
        error: "",
        tree: null,
      });
      setActiveSheetId("");
      setSelectedSheetIds([]);
      return;
    }

    const sourceType = detectMindmapSourceType(file);
    if (sourceType === "unsupported") {
      setStep("select");
      setParseState({
        loading: false,
        error: `不支持的脑图文件类型: ${file.name}。当前仅支持Markdown、OPML、FreeMind、XMind、MindManager和iThoughts。`,
        tree: null,
      });
      setActiveSheetId("");
      setSelectedSheetIds([]);
      return;
    }

    setParseState({
      loading: true,
      error: "",
      tree: null,
    });

    try {
      const tree = await parseMindmapFileBySourceType(sourceType, file);
      const nextPreview = buildMindmapImportPreview(tree);

      setParseState({
        loading: false,
        error: "",
        tree,
      });
      setActiveSheetId(nextPreview.sheets[0] ? nextPreview.sheets[0].id : "");
      setSelectedSheetIds(collectPreviewSheetIds(nextPreview));
      setStep("preview");
    } catch (error) {
      setStep("select");
      setParseState({
        loading: false,
        error: error && error.message ? error.message : String(error),
        tree: null,
      });
      setActiveSheetId("");
      setSelectedSheetIds([]);
    }
  }

  function onFileChange(event) {
    const file = event.target.files && event.target.files[0] ? event.target.files[0] : null;
    void handleFileSelection(file);
    event.target.value = "";
  }

  function onDrop(event) {
    event.preventDefault();
    const file = event.dataTransfer.files && event.dataTransfer.files[0] ? event.dataTransfer.files[0] : null;
    void handleFileSelection(file);
  }

  function onDragOver(event) {
    event.preventDefault();
  }

  function returnToSelection() {
    clearImportPolling();
    setStep("select");
    setSelectedFile(null);
    setParseState({
      loading: false,
      error: "",
      tree: null,
    });
    setImportState({
      loading: false,
      error: "",
      message: "",
    });
    setImportProgress(null);
    setActiveSheetId("");
    setSelectedSheetIds([]);
  }

  function onSheetSelectionChange(sheetId, checked) {
    const normalizedSheetId = String(sheetId || "");
    setSelectedSheetIds((current) => {
      if (!normalizedSheetId) {
        return current;
      }
      if (checked) {
        return current.includes(normalizedSheetId) ? current : [...current, normalizedSheetId];
      }
      return current.filter((item) => item !== normalizedSheetId);
    });
  }

  function handleSelectSheet(sheetId) {
    setActiveSheetId(String(sheetId || ""));
    setSheetPickerOpen(false);
  }

  async function onImport() {
    if (!parseState.tree || importState.loading) {
      return;
    }
    if (selectedSheetIds.length === 0) {
      setImportState({
        loading: false,
        error: "请先选择要导入的脑图内容。",
        message: "",
      });
      setImportProgress(null);
      return;
    }

    clearImportPolling();
    setImportState({
      loading: true,
      error: "",
      message: "",
    });

    try {
      const startResult = await startMindmapImport(parseState.tree, selectedSheetIds);
      const taskId = String(startResult.taskId || "");
      if (!taskId) {
        throw new Error("Mindmap import taskId is missing");
      }

      importTaskIdRef.current = taskId;
      setImportProgress(startResult);

      const pollTask = async () => {
        try {
          const progress = await getMindmapImportProgress(taskId);
          if (importTaskIdRef.current !== taskId) {
            return;
          }

          setImportProgress(progress);

          if (progress.phase === "done") {
            const result = await getMindmapImportResult(taskId);
            if (importTaskIdRef.current !== taskId) {
              return;
            }

            clearImportPolling();
            const successMessage = buildImportSuccessText(result);
            setImportState({
              loading: false,
              error: "",
              message: successMessage,
            });
            await showAlertMessage(successMessage);
            return;
          }

          if (progress.phase === "error") {
            clearImportPolling();
            setImportState({
              loading: false,
              error: progress.error || progress.message || "脑图导入失败",
              message: "",
            });
            return;
          }

          importPollTimerRef.current = window.setTimeout(pollTask, MINDMAP_IMPORT_POLL_MS);
        } catch (error) {
          if (importTaskIdRef.current !== taskId) {
            return;
          }

          clearImportPolling();
          setImportState({
            loading: false,
            error: error && error.message ? error.message : String(error),
            message: "",
          });
        }
      };

      importPollTimerRef.current = window.setTimeout(pollTask, MINDMAP_IMPORT_POLL_MS);
    } catch (error) {
      clearImportPolling();
      setImportState({
        loading: false,
        error: error && error.message ? error.message : String(error),
        message: "",
      });
      setImportProgress(null);
    }
  }

  const canImport = step === "preview"
    && !!parseState.tree
    && !importState.loading
    && !contextState.error
    && selectedSheetIds.length > 0;

  return (
    <div className="app-shell">
      <PageTopbar label="脑图导入" onBack={() => navigate("/")} />

      <main className={`shell-content ${step === "preview" ? "shell-content-stretch" : ""}`}>
        {step === "select" ? (
          <section className="surface">
            <div className="section-head">
              <div>
                <h2>选择脑图文件</h2>
              </div>
            </div>

            <label className="upload-dropzone mindmap-dropzone" onDrop={onDrop} onDragOver={onDragOver}>
              <input type="file" onChange={onFileChange} />
              <span className="dropzone-title">点击选择或拖入脑图文件</span>
              <small>XMind、Markdown、OPML、FreeMind(.mm)、MindManager(.mmap/.xmmap)、iThoughts(.itmz)</small>
            </label>

            {contextState.loading ? <p className="muted-text">正在读取导入上下文…</p> : null}
            {parseState.loading ? <p className="muted-text">正在解析脑图结构…</p> : null}
            {contextState.error ? <p className="error-text">{contextState.error}</p> : null}
            {parseState.error ? <p className="error-text">{parseState.error}</p> : null}
          </section>
        ) : null}

        {step === "preview" && preview ? (
          <section className="surface mindmap-preview-surface">
            <div className="section-head">
              <div>
                <h2>脑图预览</h2>
                <p>{selectedFile ? selectedFile.name : preview.tree.title}</p>
              </div>
              <div className="card-actions">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={returnToSelection}
                  disabled={importState.loading}
                >
                  重新选择文件
                </button>
                <button
                  type="button"
                  className="button button-primary"
                  onClick={onImport}
                  disabled={!canImport}
                >
                  {importState.loading ? "导入中" : "导入到当前脑图"}
                </button>
              </div>
            </div>

            <div className="mindmap-sheet-bar">
              {!isMarkdownPreview ? (
                <>
                  <div className="mindmap-sheet-selector">
                    {preview.sheets.length > 1 ? (
                      <div
                        ref={sheetPickerRef}
                        className={`style-picker mindmap-sheet-picker ${sheetPickerOpen ? "style-picker-open" : ""}`}
                      >
                        <button
                          type="button"
                          className="style-picker-trigger mindmap-sheet-trigger"
                          onClick={() => setSheetPickerOpen((current) => !current)}
                          aria-haspopup="listbox"
                          aria-expanded={sheetPickerOpen ? "true" : "false"}
                        >
                          <span>{activeSheetLabel}</span>
                          <span className="style-picker-caret">{sheetPickerOpen ? "▲" : "▼"}</span>
                        </button>

                        {sheetPickerOpen ? (
                          <div className="style-picker-menu mindmap-sheet-menu" role="listbox" aria-label="脑图sheet">
                            {preview.sheets.map((sheet, index) => {
                              const selected = !!activeSheet && sheet.id === activeSheet.id;
                              return (
                                <button
                                  key={sheet.id}
                                  type="button"
                                  role="option"
                                  aria-selected={selected ? "true" : "false"}
                                  className={`style-picker-option ${selected ? "style-picker-option-selected" : ""}`}
                                  onClick={() => handleSelectSheet(sheet.id)}
                                >
                                  <span>{`Sheet ${index + 1} · ${sheet.title}`}</span>
                                </button>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <div className="mindmap-selection-summary">
                    已选{selectedSheetIds.length}个，共{preview.sheets.length}个
                  </div>
                </>
              ) : null}
            </div>

            <div className={`mindmap-preview-layout ${isMarkdownPreview ? "mindmap-preview-layout-single" : ""}`}>
              {!isMarkdownPreview ? (
                <aside className="mindmap-sheet-panel">
                  <div className="mindmap-sheet-panel-head">
                    <h3>导入sheet</h3>
                  </div>
                  <div className="mindmap-sheet-checklist">
                    {preview.sheets.map((sheet, index) => {
                      const checked = selectedSheetIds.includes(sheet.id);
                      return (
                        <label key={sheet.id} className={`mindmap-sheet-item ${checked ? "mindmap-sheet-item-selected" : ""}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => onSheetSelectionChange(sheet.id, event.target.checked)}
                          />
                          <div className="mindmap-sheet-item-meta">
                            <strong>{`Sheet ${index + 1} · ${sheet.title}`}</strong>
                            <span>{`${sheet.nodeCount}个节点 · 深度${sheet.maxDepth}`}</span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </aside>
              ) : null}

              <div className="mindmap-preview-main">
                {activeSheet ? (
                  <>
                    {!isMarkdownPreview ? (
                      <div className="section-head">
                        <div>
                          <h2>{activeSheet.title}</h2>
                        </div>
                      </div>
                    ) : null}
                    <MindmapCanvasPreview root={activeSheet.root} />
                  </>
                ) : (
                  <p className="muted-text">当前没有可预览的脑图内容。</p>
                )}
              </div>
            </div>

            {contextState.error ? <p className="error-text">{contextState.error}</p> : null}
            {importProgressModel && (importState.loading || importState.message) ? (
              <ProgressCard
                percent={importProgressModel.targetPercent}
                fileName={importProgressModel.fileName}
                actionLabel={importProgressModel.actionLabel}
              />
            ) : null}
            {importState.error ? <p className="error-text">{importState.error}</p> : null}
            {importState.message ? <p className="success-text">{importState.message}</p> : null}
          </section>
        ) : null}
      </main>
    </div>
  );
}

export default MindmapImportPage;
