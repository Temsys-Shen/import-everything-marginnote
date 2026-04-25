import { useMemo, useState } from "react";
import { runConversionPipeline, buildInitialDocuments } from "./pipeline/convertPipeline";
import { ParseStatus } from "./pipeline/documentModel";
import {
  buildMergedPreviewModel,
  createMergedPreviewSlice,
  DEFAULT_PREVIEW_SECTION_LIMIT,
} from "./preview/mergedPreviewModel";
import MergedPreview from "./preview/MergedPreview";
import { exportMergedPreviewToDocumentPath } from "./services/exportService";

const STEP_ORDER = ["select", "converting", "result"];

const STEP_META = {
  select: {
    key: "select",
    number: "01",
    title: "选择文件",
  },
  converting: {
    key: "converting",
    number: "02",
    title: "开始转换",
  },
  result: {
    key: "result",
    number: "03",
    title: "导入文档",
  },
};

function statusLabel(status) {
  if (status === ParseStatus.PENDING) return "待处理";
  if (status === ParseStatus.PROCESSING) return "处理中";
  if (status === ParseStatus.SUCCESS) return "成功";
  if (status === ParseStatus.ERROR) return "失败";
  return status;
}

function sourceTypeLabel(sourceType) {
  if (sourceType === "docx") return "Word";
  if (sourceType === "rtf") return "RTF";
  if (sourceType === "spreadsheet") return "表格";
  if (sourceType === "pptx") return "演示文稿";
  if (sourceType === "markdown") return "Markdown";
  if (sourceType === "html") return "HTML";
  if (sourceType === "text") return "文本";
  if (sourceType === "epub") return "EPUB";
  if (sourceType === "image") return "图片";
  if (sourceType === "code") return "代码";
  if (sourceType === "unsupported-doc") return "DOC不支持";
  if (sourceType === "unsupported-ppt") return "PPT不支持";
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

function buildExportFileName(selectedFiles) {
  if (!selectedFiles || selectedFiles.length === 0) {
    return `ImportEverything-${Date.now()}.pdf`;
  }

  if (selectedFiles.length === 1) {
    const name = selectedFiles[0].name.replace(/\.[^.]+$/, "");
    return `${name}-merged.pdf`;
  }

  return `Merged-${selectedFiles.length}-files-${Date.now()}.pdf`;
}

function getFileIdentity(file) {
  return `${file.name}::${file.size}::${file.lastModified}`;
}

function mergeUniqueFiles(existingFiles, incomingFiles) {
  const seen = new Set(existingFiles.map(getFileIdentity));
  const addedFiles = [];
  let duplicateCount = 0;

  incomingFiles.forEach((file) => {
    const identity = getFileIdentity(file);
    if (seen.has(identity)) {
      duplicateCount += 1;
      return;
    }

    seen.add(identity);
    addedFiles.push(file);
  });

  return {
    mergedFiles: existingFiles.concat(addedFiles),
    addedCount: addedFiles.length,
    duplicateCount,
  };
}

function buildSelectProgressText(files, options = {}) {
  const {
    source = "select",
    addedCount = null,
    duplicateCount = 0,
    previousCount = 0,
  } = options;

  if (!files || files.length === 0) {
    return "选择文件后再开始转换";
  }

  if (source === "reorder") {
    return `顺序已更新，共${files.length}个文件`;
  }

  if (source === "remove") {
    return `已更新文件列表，共${files.length}个文件`;
  }

  if (source === "clear") {
    return "选择文件后再开始转换";
  }

  if (addedCount === 0 && duplicateCount > 0) {
    return `选择的${duplicateCount}个文件都已在列表中，未追加`;
  }

  if (addedCount && duplicateCount > 0) {
    return `已追加${addedCount}个文件，跳过${duplicateCount}个重复文件，共${files.length}个文件`;
  }

  if (addedCount && previousCount > 0) {
    return `已追加${addedCount}个文件，共${files.length}个文件`;
  }

  if (source === "drop") {
    return `已拖入${files.length}个文件，按当前顺序开始转换`;
  }

  return `已准备${files.length}个文件，点击开始转换`;
}

function buildProgressText(progress) {
  if (!progress) {
    return "正在准备转换";
  }

  if (progress.total) {
    return `${progress.fileName} · ${progress.stage} ${progress.current}/${progress.total}`;
  }

  if (progress.fileName && progress.stage) {
    return `${progress.fileName} · ${progress.stage}`;
  }

  return progress.stage || "正在处理";
}

function StepIndicator({ currentStep }) {
  const currentIndex = STEP_ORDER.indexOf(currentStep);

  return (
    <nav className="step-strip" aria-label="转换步骤">
      {STEP_ORDER.map((stepKey, index) => {
        const item = STEP_META[stepKey];
        const state = index < currentIndex ? "done" : index === currentIndex ? "active" : "upcoming";

        return (
          <div key={stepKey} className={`step-pill step-${state}`}>
            <span className="step-number">{item.number}</span>
            <span className="step-title">{item.title}</span>
          </div>
        );
      })}
    </nav>
  );
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
    return (
      <div className="empty-block">
        <p>支持Word、Markdown、图片、代码、表格等内容。</p>
      </div>
    );
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

function DocumentStatusList({ documents }) {
  if (documents.length === 0) {
    return <p className="muted-text">暂无文件任务。</p>;
  }

  return (
    <div className="status-list">
      {documents.map((doc) => (
        <article key={doc.id} className={`status-card status-${doc.parseStatus}`}>
          <header className="status-card-header">
            <h3>{doc.name}</h3>
            <span>{statusLabel(doc.parseStatus)}</span>
          </header>
          <p>{sourceTypeLabel(doc.sourceType)}</p>
          {doc.error ? <p className="error-text">{doc.error.message}</p> : null}
          {doc.warnings && doc.warnings.length > 0 ? (
            <ul className="warning-list">
              {doc.warnings.map((warning, index) => (
                <li key={`${doc.id}-warning-${index}`}>{warning}</li>
              ))}
            </ul>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function App() {
  const [step, setStep] = useState("select");
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [isConverting, setIsConverting] = useState(false);
  const [progressText, setProgressText] = useState("选择文件后再开始转换");
  const [currentProgress, setCurrentProgress] = useState(null);
  const [showStatusDetails, setShowStatusDetails] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [showFullPreview, setShowFullPreview] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgressText, setSaveProgressText] = useState("尚未导入到MN文档");
  const [saveError, setSaveError] = useState(null);
  const [lastSavedInfo, setLastSavedInfo] = useState(null);

  const previewModel = useMemo(() => buildMergedPreviewModel(documents), [documents]);
  const compactPreviewModel = useMemo(
    () => createMergedPreviewSlice(previewModel, DEFAULT_PREVIEW_SECTION_LIMIT),
    [previewModel],
  );

  const activePreviewModel = showFullPreview ? previewModel : compactPreviewModel;
  const successCount = documents.filter((item) => item.parseStatus === ParseStatus.SUCCESS).length;
  const errorCount = documents.filter((item) => item.parseStatus === ParseStatus.ERROR).length;
  const processingDoc = documents.find((item) => item.parseStatus === ParseStatus.PROCESSING) || null;
  const canStartConversion = selectedFiles.length > 0 && !isConverting;
  const canImportToMN = previewModel.totalContentSections > 0 && !isSaving;

  const subtitle =
    step === "select"
      ? progressText
      : step === "converting"
        ? buildProgressText(currentProgress) || progressText
        : saveError
          ? saveProgressText
          : lastSavedInfo
            ? "已导入到MN文档目录"
            : `转换完成，成功${successCount}个，失败${errorCount}个`;

  function resetSaveState() {
    setIsSaving(false);
    setSaveError(null);
    setLastSavedInfo(null);
    setSaveProgressText("尚未导入到MN文档");
  }

  function syncFiles(nextFiles, progressOptions = {}) {
    setSelectedFiles(nextFiles);
    setDocuments(buildInitialDocuments(nextFiles));
    setStep("select");
    setIsConverting(false);
    setCurrentProgress(null);
    setShowStatusDetails(false);
    setShowPreview(true);
    setShowFullPreview(false);
    resetSaveState();
    setProgressText(buildSelectProgressText(nextFiles, progressOptions));
  }

  function appendFiles(incomingFiles, source) {
    if (!incomingFiles || incomingFiles.length === 0) {
      return;
    }

    const { mergedFiles, addedCount, duplicateCount } = mergeUniqueFiles(selectedFiles, incomingFiles);
    syncFiles(mergedFiles, {
      source,
      addedCount,
      duplicateCount,
      previousCount: selectedFiles.length,
    });
  }

  function onFileChange(event) {
    const files = Array.from(event.target.files || []);
    appendFiles(files, "select");
    event.target.value = "";
  }

  function onDrop(event) {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files || []);
    appendFiles(files, "drop");
  }

  function onDragOver(event) {
    event.preventDefault();
  }

  function clearAll() {
    syncFiles([], { source: "clear" });
  }

  function removeFileAt(index) {
    const nextFiles = selectedFiles.filter((_, fileIndex) => fileIndex !== index);
    syncFiles(nextFiles, { source: "remove" });
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
    syncFiles(nextFiles, { source: "reorder" });
  }

  function returnToSelection() {
    setDocuments(buildInitialDocuments(selectedFiles));
    setStep("select");
    setIsConverting(false);
    setCurrentProgress(null);
    setShowStatusDetails(false);
    setShowPreview(true);
    setShowFullPreview(false);
    resetSaveState();
    setProgressText(buildSelectProgressText(selectedFiles, { source: "select" }));
  }

  async function startConversion() {
    if (!canStartConversion) {
      return;
    }

    setStep("converting");
    setIsConverting(true);
    setShowStatusDetails(false);
    setShowPreview(true);
    setShowFullPreview(false);
    resetSaveState();
    setProgressText("开始执行转换");
    setCurrentProgress({
      stage: "正在准备转换",
      fileName: "",
    });

    try {
      const converted = await runConversionPipeline(selectedFiles, {
        onDocumentsChange(nextDocs) {
          setDocuments(nextDocs);
        },
        onProgress(progress) {
          setCurrentProgress(progress);
          setProgressText(buildProgressText(progress));
        },
      });

      const ok = converted.filter((item) => item.parseStatus === ParseStatus.SUCCESS).length;
      const bad = converted.filter((item) => item.parseStatus === ParseStatus.ERROR).length;
      setProgressText(`转换完成，成功${ok}个，失败${bad}个`);
    } catch (error) {
      setProgressText(`转换异常: ${error && error.message ? error.message : String(error)}`);
    } finally {
      setIsConverting(false);
      setStep("result");
    }
  }

  async function saveToDocumentPath() {
    if (!canImportToMN) {
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setLastSavedInfo(null);
    setSaveProgressText("正在生成完整PDF并导入MN文档");

    try {
      const rootElement = document.getElementById("export-print-root");
      const result = await exportMergedPreviewToDocumentPath({
        rootElement,
        fileName: buildExportFileName(selectedFiles),
        onProgress(progress) {
          if (progress.stage === "transfer") {
            setSaveProgressText(`正在写入MN文档 ${progress.chunkIndex + 1}/${progress.totalChunks}`);
            return;
          }

          setSaveProgressText(progress.message || progress.stage);
        },
      });

      setLastSavedInfo(result.data || null);
      setSaveProgressText("导入成功，已写入文档目录并自动导入");
    } catch (error) {
      const normalized = {
        command: error && error.command ? error.command : "unknown",
        chunkIndex:
          error && error.chunkIndex !== undefined && error.chunkIndex !== null
            ? error.chunkIndex
            : "n/a",
        message: error && error.message ? error.message : String(error),
      };
      setSaveError(normalized);
      setSaveProgressText(`导入失败: ${normalized.message}`);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="shell-header">
        <div>
          <h1>万物转PDF</h1>
          <p>{subtitle}</p>
        </div>
      </header>

      <StepIndicator currentStep={step} />

      <main className="shell-content">
        {step === "select" ? (
          <section className="surface">
            <div className="section-head">
              <div>
                <h2>按顺序准备文件</h2>
                <p>点击选择或拖入文件时，都会在当前列表后继续追加。</p>
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
                accept=".doc,.docx,.rtf,.xls,.xlsx,.csv,.ppt,.pptx,.md,.markdown,.html,.htm,.txt,.xml,.json,.rs,.py,.js,.ts,.epub,image/*"
              />
              <span className="dropzone-title">点击选择或拖入文件</span>
              <small>支持文档、表格、图片、代码与电子书，可增量追加</small>
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
            <div className="result-summary">
              <div className="summary-chip">
                <span>总数</span>
                <strong>{documents.length}</strong>
              </div>
              <div className="summary-chip">
                <span>成功</span>
                <strong>{successCount}</strong>
              </div>
              <div className="summary-chip">
                <span>失败</span>
                <strong>{errorCount}</strong>
              </div>
            </div>

            <div className="progress-card">
              <h2>正在转换</h2>
              <p>{progressText}</p>
              <dl className="progress-grid">
                <div>
                  <dt>当前文件</dt>
                  <dd>{processingDoc ? processingDoc.name : currentProgress?.fileName || "准备中"}</dd>
                </div>
                <div>
                  <dt>当前阶段</dt>
                  <dd>{currentProgress?.stage || "处理中"}</dd>
                </div>
              </dl>
            </div>

            <div className="detail-block">
              <div className="detail-head">
                <div>
                  <h2>文件明细</h2>
                  <p>展开后可查看每个文件的处理状态。</p>
                </div>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setShowStatusDetails((value) => !value)}
                >
                  {showStatusDetails ? "收起文件明细" : "展开文件明细"}
                </button>
              </div>

              {showStatusDetails ? <DocumentStatusList documents={documents} /> : null}
            </div>
          </section>
        ) : null}

        {step === "result" ? (
          <section className="surface result-surface">
            <div className="result-summary">
              <div className="summary-chip">
                <span>成功文件</span>
                <strong>{successCount}</strong>
              </div>
              <div className="summary-chip">
                <span>失败文件</span>
                <strong>{errorCount}</strong>
              </div>
              <div className="summary-chip">
                <span>可导入正文</span>
                <strong>{previewModel.totalContentSections}</strong>
              </div>
            </div>

            <div className="message-stack">
              <p className="muted-text">{saveProgressText}</p>
              {saveError ? (
                <p className="error-text">
                  导入失败: command={saveError.command}, chunkIndex={saveError.chunkIndex}, message={saveError.message}
                </p>
              ) : null}
              {lastSavedInfo && lastSavedInfo.savedPath ? (
                <p className="success-text">已写入: {lastSavedInfo.savedPath}</p>
              ) : null}
            </div>

            <div className="detail-block">
              <div className="detail-head">
                <div>
                  <h2>文件明细</h2>
                  <p>只在需要排查失败或warning时展开查看。</p>
                </div>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setShowStatusDetails((value) => !value)}
                >
                  {showStatusDetails ? "收起文件明细" : "展开文件明细"}
                </button>
              </div>

              {!showStatusDetails ? (
                <p className="collapsed-note">
                  {errorCount > 0 ? `有${errorCount}个失败文件，可展开查看原因。` : "全部成功，无需排查。"}
                </p>
              ) : (
                <DocumentStatusList documents={documents} />
              )}
            </div>

            <div className="preview-card">
              <div className="preview-card-head">
                <div>
                  <h2>正文预览</h2>
                  <p>
                    {showFullPreview || !compactPreviewModel.hasHiddenContentSections
                      ? "当前显示完整正文内容"
                      : `当前显示前${compactPreviewModel.visibleContentSections}个正文片段`}
                  </p>
                </div>

                <div className="card-actions">
                  {showPreview && compactPreviewModel.hasHiddenContentSections ? (
                    <button
                      type="button"
                      className="button button-ghost"
                      onClick={() => setShowFullPreview((value) => !value)}
                    >
                      {showFullPreview ? "收起详细预览" : "展开全部预览"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => setShowPreview((value) => !value)}
                  >
                    {showPreview ? "收起正文预览" : "展开正文预览"}
                  </button>
                </div>
              </div>

              {!showPreview ? (
                <p className="collapsed-note">
                  {previewModel.totalContentSections > 0
                    ? "正文预览已折叠，展开后可查看可导入内容。"
                    : "没有成功转换的正文内容。"}
                </p>
              ) : (
                <div className="preview-scroll">
                  <MergedPreview
                    model={activePreviewModel}
                    variant="panel"
                    rootId="result-preview-root"
                    emptyText="没有成功转换的正文内容，暂时无法预览。"
                  />
                </div>
              )}
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

      {previewModel.printableSections.length > 0 ? (
        <div className="export-render-host" aria-hidden="true">
          <MergedPreview model={previewModel} variant="export" rootId="export-print-root" />
        </div>
      ) : null}
    </div>
  );
}

export default App;
