import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronUp } from "lucide-react";
import PageTopbar from "../components/PageTopbar";
import ProgressCard from "../components/ProgressCard";
import MindmapFlowPreview from "../mindmap/MindmapFlowPreview";
import { buildMindmapImportPreview, visitMindmapNodes } from "../mindmap/model";
import { detectMindmapSourceType, parseMindmapFileBySourceType, ZIP_MINDMAP_SOURCE_TYPE_OPTIONS, detectZipMindmapSourceTypeFromFile } from "../mindmap/sourceTypes";
import { revokeObjectURLsForFile } from "../parsers/objectUrlRegistry";
import { buildMindmapImportProgressModel, buildMindmapParseProgressModel } from "../progress/progressModel";
import { completeImportWithNotice } from "../services/exportConfigService";
import {
  getMindmapImportContext,
  getMindmapImportProgress,
  getMindmapImportResult,
  startMindmapImport,
} from "../services/mindmapImportService";

const MINDMAP_IMPORT_POLL_MS = 120;
const DEFAULT_MARKDOWN_MINDMAP_FILE_NAME = "Markdown脑图.md";

function normalizeMarkdownMindmapFileName(value) {
  const trimmed = String(value || "").trim();
  const baseName = trimmed || DEFAULT_MARKDOWN_MINDMAP_FILE_NAME;
  return /\.(md|markdown|mkd|mkdn)$/i.test(baseName) ? baseName : `${baseName}.md`;
}

function createMarkdownMindmapFile(fileName, content) {
  if (typeof File !== "function") {
    throw new Error("File constructor is not available in this WebView");
  }

  return new File([content], normalizeMarkdownMindmapFileName(fileName), {
    type: "text/markdown",
    lastModified: Date.now(),
  });
}

function buildImportSuccessText(result) {
  const count = Number(result && result.createdCount ? result.createdCount : 0);
  if (count <= 0) {
    return "脑图导入已完成";
  }
  return `脑图导入完成，共创建${count}个节点`;
}

function formatMindmapContextError(error) {
  const message = error && error.message ? error.message : String(error);
  const noDocumentError = message === "current document is unavailable"
    || message === "notebook.documents is empty"
    || message === "notebook.documents is unavailable";

  if (noDocumentError) {
    return "当前学习集内没有可用文档，请先向学习集导入至少一个文档后再导入脑图。";
  }

  return message;
}

function collectPreviewSheetIds(preview) {
  if (!preview || !Array.isArray(preview.sheets)) {
    return [];
  }
  return preview.sheets.map((sheet) => String(sheet.id || "")).filter(Boolean);
}

function countSelectedImageNodes(tree, selectedSheetIds) {
  const sheets = Array.isArray(tree && tree.sheets) ? tree.sheets : [];
  const selectedIds = Array.isArray(selectedSheetIds) && selectedSheetIds.length > 0
    ? selectedSheetIds.map((sheetId) => String(sheetId))
    : null;
  const selectedSheets = selectedIds
    ? sheets.filter((sheet) => sheet && selectedIds.includes(String(sheet.id || "")))
    : sheets;

  let count = 0;
  selectedSheets.forEach((sheet) => {
    visitMindmapNodes(sheet && sheet.root ? sheet.root : null, (node) => {
      if (node && node.image) {
        count += 1;
      }
    });
  });

  return count;
}

function MindmapImportPage() {
  const navigate = useNavigate();
  const sheetPickerRef = useRef(null);
  const [step, setStep] = useState("select");
  const [sourceMode, setSourceMode] = useState("file");
  const [markdownTextFileName, setMarkdownTextFileName] = useState(DEFAULT_MARKDOWN_MINDMAP_FILE_NAME);
  const [markdownTextContent, setMarkdownTextContent] = useState("");
  const [markdownTextError, setMarkdownTextError] = useState("");
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
  const [parseProgress, setParseProgress] = useState(null);
  const [zipFormatPrompt, setZipFormatPrompt] = useState(null);
  const [activeSheetId, setActiveSheetId] = useState("");
  const [selectedSheetIds, setSelectedSheetIds] = useState([]);
  const [sheetPickerOpen, setSheetPickerOpen] = useState(false);
  const [includeMarkdownContent, setIncludeMarkdownContent] = useState(true);
  const [includeListAsChildren, setIncludeListAsChildren] = useState(true);
  const importPollTimerRef = useRef(null);
  const importTaskIdRef = useRef("");
  // 解析出的图片用 blob URL 挂在这个文件上，换文件/离开页面时要统一回收。
  const activeFileRef = useRef(null);

  useEffect(() => {
    activeFileRef.current = selectedFile;
  }, [selectedFile]);

  useEffect(() => () => {
    if (activeFileRef.current) {
      revokeObjectURLsForFile(activeFileRef.current);
    }
  }, []);

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
          error: formatMindmapContextError(error),
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
  // 只有一个画布时不需要选择面板：画布标题行已经能说明内容与规模。
  const showSheetPanel = !!preview && !isMarkdownPreview && preview.sheets.length > 1;

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

  const parseProgressModel = useMemo(
    () => buildMindmapParseProgressModel(parseProgress, selectedFile ? selectedFile.name : "", parseState.loading),
    [parseProgress, parseState.loading, selectedFile],
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

  async function handleFileSelection(file, override = {}) {
    const effectiveIncludeLists = override.includeListsAsChildren !== undefined
      ? override.includeListsAsChildren
      : includeListAsChildren;
    if (activeFileRef.current && activeFileRef.current !== file) {
      // 换文件时先回收上一份解析结果里的图片 blob URL。
      revokeObjectURLsForFile(activeFileRef.current);
    }
    clearImportPolling();
    setSelectedFile(file);
    if (override.includeListsAsChildren === undefined) {
      setIncludeListAsChildren(true);
    }
    setIncludeMarkdownContent(true);
    setImportState({
      loading: false,
      error: "",
      message: "",
    });
    setImportProgress(null);
    setParseProgress(null);

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
        error: `不支持的脑图文件类型: ${file.name}。当前仅支持Markdown、OPML、FreeMind、XMind、MindManager、iThoughts和SimpleMind。`,
        tree: null,
      });
      setActiveSheetId("");
      setSelectedSheetIds([]);
      return;
    }

    if (Number(file.size) === 0) {
      setStep("select");
      setParseState({
        loading: false,
        error: "由于 iOS/iPadOS 限制，请将文件后缀改为 .zip 后再尝试导入。",
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
    setParseProgress({
      phase: "read",
      current: 0,
      total: 1,
      message: "正在读取脑图文件",
    });

    let resolvedSourceType = override.sourceType || sourceType;
    if (!override.sourceType && sourceType === "zip") {
      // .zip 不区分格式：先按 zip 内容判断，判不出来再让用户选
      try {
        resolvedSourceType = await detectZipMindmapSourceTypeFromFile(file);
      } catch (error) {
        resolvedSourceType = "";
      }

      if (!resolvedSourceType) {
        setParseState({
          loading: false,
          error: "",
          tree: null,
        });
        setParseProgress(null);
        setZipFormatPrompt({ file });
        return;
      }
    }

    try {
      const tree = await parseMindmapFileBySourceType(resolvedSourceType, file, {
        includeListsAsChildren: effectiveIncludeLists,
        onProgress: (progress) => setParseProgress(progress),
      });
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
      setParseProgress(null);
      setActiveSheetId("");
      setSelectedSheetIds([]);
    }
  }

  function onFileChange(event) {
    const file = event.target.files && event.target.files[0] ? event.target.files[0] : null;
    void handleFileSelection(file);
    event.target.value = "";
  }

  function submitMarkdownText() {
    setMarkdownTextError("");
    if (!markdownTextContent.trim()) {
      setMarkdownTextError("请输入Markdown正文");
      return;
    }

    try {
      const file = createMarkdownMindmapFile(markdownTextFileName, markdownTextContent);
      void handleFileSelection(file);
    } catch (error) {
      setMarkdownTextError(`Markdown脑图解析失败: ${error && error.message ? error.message : String(error)}`);
    }
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
    if (activeFileRef.current) {
      revokeObjectURLsForFile(activeFileRef.current);
    }
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
    setParseProgress(null);
    setActiveSheetId("");
    setSelectedSheetIds([]);
    setIncludeMarkdownContent(true);
    setIncludeListAsChildren(true);
    setZipFormatPrompt(null);
  }

  async function onZipFormatSelected(nextSourceType) {
    const pending = zipFormatPrompt;
    setZipFormatPrompt(null);
    if (!pending || !pending.file) {
      return;
    }
    await handleFileSelection(pending.file, { sourceType: nextSourceType });
  }

  function onZipFormatCancelled() {
    setZipFormatPrompt(null);
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

    const imageCount = countSelectedImageNodes(parseState.tree, selectedSheetIds);
    setImportProgress({
      phase: "submit",
      current: 0,
      total: imageCount,
      indeterminate: imageCount === 0,
      message: imageCount > 0
        ? `正在准备导入数据 0/${imageCount}`
        : "正在准备导入数据",
    });

    try {
      const startResult = await startMindmapImport(parseState.tree, selectedSheetIds, {
        includeMarkdownContent,
        onImageProgress: ({ current, total }) => {
          setImportProgress({
            phase: "submit",
            current,
            total,
            message: `正在准备导入数据 ${current}/${total}`,
          });
        },
      });
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
            try {
              await completeImportWithNotice(successMessage);
            } catch (error) {
              setImportState({
                loading: false,
                error: error && error.message ? `导入已完成，但收起面板或弹窗提示失败: ${error.message}` : `导入已完成，但收起面板或弹窗提示失败: ${String(error)}`,
                message: successMessage,
              });
            }
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
                <h2>选择脑图来源</h2>
              </div>
            </div>

            <div className="source-segmented" role="group" aria-label="选择导入来源">
              <button
                type="button"
                className={`source-segmented-button${sourceMode === "file" ? " source-segmented-button-active" : ""}`}
                onClick={() => setSourceMode("file")}
                aria-pressed={sourceMode === "file"}
              >
                文件
              </button>
              <button
                type="button"
                className={`source-segmented-button${sourceMode === "markdown" ? " source-segmented-button-active" : ""}`}
                onClick={() => setSourceMode("markdown")}
                aria-pressed={sourceMode === "markdown"}
              >
                Markdown文字
              </button>
            </div>

            {sourceMode === "file" ? (
              <label className="upload-dropzone mindmap-dropzone" onDrop={onDrop} onDragOver={onDragOver}>
                <input type="file" onChange={onFileChange} />
                <span className="dropzone-title">点击选择或拖入脑图文件</span>
                <small>XMind、Markdown、OPML、FreeMind(.mm)、MindManager(.mmap/.xmmap)、iThoughts(.itmz)、SimpleMind(.smmx)</small>
              </label>
            ) : (
              <div className="markdown-source-panel">
                <label className="markdown-title-field">
                  <span>文件名</span>
                  <input
                    type="text"
                    value={markdownTextFileName}
                    onChange={(event) => {
                      setMarkdownTextFileName(event.target.value);
                      setMarkdownTextError("");
                    }}
                  />
                </label>

                <textarea
                  className="markdown-textarea"
                  value={markdownTextContent}
                  onChange={(event) => {
                    setMarkdownTextContent(event.target.value);
                    setMarkdownTextError("");
                  }}
                  placeholder="输入Markdown正文（标题层级将生成脑图节点）"
                />

                <div className="markdown-source-actions">
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={submitMarkdownText}
                    disabled={!markdownTextContent.trim()}
                  >
                    解析为脑图
                  </button>
                </div>

                {markdownTextError ? <p className="error-text">{markdownTextError}</p> : null}
              </div>
            )}

            {contextState.loading ? <p className="muted-text">正在读取导入上下文…</p> : null}
            {parseState.loading && parseProgressModel ? (
              <ProgressCard
                percent={parseProgressModel.targetPercent}
                fileName={parseProgressModel.fileName}
                message={parseProgressModel.message}
                indeterminate={parseProgressModel.indeterminate}
              />
            ) : null}
            {parseState.loading && !parseProgressModel ? <p className="muted-text">正在解析脑图结构…</p> : null}
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

            {isMarkdownPreview ? (
              <div className="mindmap-sheet-bar">
                <div className="mindmap-content-toggles">
                  <label className="mindmap-content-toggle">
                    <input
                      type="checkbox"
                      checked={includeListAsChildren}
                      disabled={importState.loading || parseState.loading}
                      onChange={(event) => {
                        const next = event.target.checked;
                        setIncludeListAsChildren(next);
                        if (selectedFile) {
                          void handleFileSelection(selectedFile, { includeListsAsChildren: next });
                        }
                      }}
                    />
                    <span>
                      <strong>列表作为子节点</strong>
                    </span>
                  </label>
                  <label className="mindmap-content-toggle">
                    <input
                      type="checkbox"
                      checked={includeMarkdownContent}
                      disabled={importState.loading}
                      onChange={(event) => setIncludeMarkdownContent(event.target.checked)}
                    />
                    <span>
                      <strong>包含Markdown正文</strong>
                    </span>
                  </label>
                </div>
              </div>
            ) : null}

            <div className={`mindmap-preview-layout ${showSheetPanel ? "" : "mindmap-preview-layout-single"}`}>
              {showSheetPanel ? (
                <aside className="mindmap-sheet-panel">
                  <div className="mindmap-sheet-panel-head">
                    <h3>导入画布</h3>
                    <div className="mindmap-sheet-panel-actions">
                      <button
                        type="button"
                        className="button button-ghost button-small"
                        onClick={() => setSelectedSheetIds(collectPreviewSheetIds(preview))}
                        disabled={selectedSheetIds.length === preview.sheets.length}
                      >
                        全选
                      </button>
                      <button
                        type="button"
                        className="button button-ghost button-small"
                        onClick={() => setSelectedSheetIds([])}
                        disabled={selectedSheetIds.length === 0}
                      >
                        清空
                      </button>
                    </div>
                  </div>
                  <p className="mindmap-sheet-panel-count">
                    {`已选 ${selectedSheetIds.length}/${preview.sheets.length} 个画布`}
                  </p>
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
                      <div className="section-head mindmap-preview-head">
                        <div>
                          <h2>{activeSheet.title}</h2>
                          <p>{`${activeSheet.nodeCount} 个节点 · 深度 ${activeSheet.maxDepth}`}</p>
                        </div>
                        {showSheetPanel ? (
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
                              <span>{`预览：${activeSheetLabel}`}</span>
                              <span className="style-picker-caret">{sheetPickerOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</span>
                            </button>

                            {sheetPickerOpen ? (
                              <div className="style-picker-menu mindmap-sheet-menu" role="listbox" aria-label="预览画布">
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
                    ) : null}
                    <MindmapFlowPreview
                      root={activeSheet.root}
                      includeMarkdownContent={!!isMarkdownPreview && includeMarkdownContent}
                    />
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
                message={importProgressModel.message}
                indeterminate={importProgressModel.indeterminate}
              />
            ) : null}
            {importState.error ? <p className="error-text">{importState.error}</p> : null}
            {importState.message ? <p className="success-text">{importState.message}</p> : null}
          </section>
        ) : null}
      </main>

      {zipFormatPrompt ? (
        <div className="progress-popup-layer" role="dialog" aria-modal="true" aria-label="选择脑图格式">
          <div className="progress-popup-backdrop" onClick={onZipFormatCancelled} />
          <section className="progress-popup-card">
            <div className="progress-popup-head">
              <h2>选择脑图格式</h2>
              <p>{`无法从 ${zipFormatPrompt.file ? zipFormatPrompt.file.name : "该文件"} 的内容判断格式，请手动选择：`}</p>
            </div>
            <div className="zip-format-options">
              {ZIP_MINDMAP_SOURCE_TYPE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className="button button-secondary"
                  onClick={() => void onZipFormatSelected(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="card-actions">
              <button type="button" className="button button-ghost" onClick={onZipFormatCancelled}>
                取消
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

export default MindmapImportPage;
