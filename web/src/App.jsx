import { useMemo, useState } from "react";
import { runConversionPipeline, buildInitialDocuments } from "./pipeline/convertPipeline";
import { ParseStatus } from "./pipeline/documentModel";
import { buildMergedPreviewModel } from "./preview/mergedPreviewModel";
import MergedPreview from "./preview/MergedPreview";
import { exportMergedPreviewToDocumentPath } from "./services/exportService";

function statusLabel(status) {
  if (status === ParseStatus.PENDING) return "待处理";
  if (status === ParseStatus.PROCESSING) return "处理中";
  if (status === ParseStatus.SUCCESS) return "成功";
  if (status === ParseStatus.ERROR) return "失败";
  return status;
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

function App() {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [isConverting, setIsConverting] = useState(false);
  const [progressText, setProgressText] = useState("等待上传文件");
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgressText, setSaveProgressText] = useState("尚未开始保存");
  const [saveError, setSaveError] = useState(null);
  const [lastSavedInfo, setLastSavedInfo] = useState(null);

  const previewModel = useMemo(() => buildMergedPreviewModel(documents), [documents]);

  const successCount = documents.filter((item) => item.parseStatus === ParseStatus.SUCCESS).length;
  const errorCount = documents.filter((item) => item.parseStatus === ParseStatus.ERROR).length;

  const onFileChange = (event) => {
    const files = Array.from(event.target.files || []);
    setSelectedFiles(files);
    setDocuments(buildInitialDocuments(files));
    setSaveError(null);
    setLastSavedInfo(null);
    setSaveProgressText("尚未开始保存");

    if (files.length === 0) {
      setProgressText("等待上传文件");
      return;
    }

    setProgressText(`已选择${files.length}个文件，点击开始转换`);
  };

  const onDrop = (event) => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files || []);
    setSelectedFiles(files);
    setDocuments(buildInitialDocuments(files));
    setSaveError(null);
    setLastSavedInfo(null);
    setSaveProgressText("尚未开始保存");

    if (files.length === 0) {
      setProgressText("等待上传文件");
      return;
    }

    setProgressText(`已拖入${files.length}个文件，点击开始转换`);
  };

  const onDragOver = (event) => {
    event.preventDefault();
  };

  const clearAll = () => {
    setSelectedFiles([]);
    setDocuments([]);
    setProgressText("等待上传文件");
    setSaveProgressText("尚未开始保存");
    setSaveError(null);
    setLastSavedInfo(null);
  };

  const startConversion = async () => {
    if (selectedFiles.length === 0 || isConverting) {
      return;
    }

    setIsConverting(true);
    setProgressText("开始执行转换管线");

    try {
      const converted = await runConversionPipeline(selectedFiles, {
        onDocumentsChange(nextDocs) {
          setDocuments(nextDocs);
        },
        onProgress(progress) {
          if (progress.total) {
            setProgressText(
              `${progress.fileName}:${progress.stage} ${progress.current}/${progress.total}`,
            );
            return;
          }

          setProgressText(`${progress.fileName}:${progress.stage}`);
        },
      });

      const ok = converted.filter((item) => item.parseStatus === ParseStatus.SUCCESS).length;
      const bad = converted.filter((item) => item.parseStatus === ParseStatus.ERROR).length;
      setProgressText(`转换完成:成功${ok}个，失败${bad}个`);
    } finally {
      setIsConverting(false);
    }
  };

  const printPreview = () => {
    window.print();
  };

  const saveToDocumentPath = async () => {
    if (isSaving) {
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setLastSavedInfo(null);

    try {
      const rootElement = document.getElementById("print-root");
      const result = await exportMergedPreviewToDocumentPath({
        rootElement,
        fileName: buildExportFileName(selectedFiles),
        onProgress(progress) {
          if (progress.stage === "transfer") {
            setSaveProgressText(
              `${progress.message} command=${progress.command} chunkIndex=${progress.chunkIndex}`,
            );
            return;
          }

          setSaveProgressText(progress.message || progress.stage);
        },
      });

      setLastSavedInfo(result.data || null);
      setSaveProgressText("保存成功，已写入文档目录并自动导入" );
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
      setSaveProgressText(
        `保存失败 command=${normalized.command} chunkIndex=${normalized.chunkIndex}`,
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="workbench-shell">
      <header className="app-topbar no-print">
        <h1>ImportEverything-PDFPrototype</h1>
        <p>纯Web原型:多格式转换为合并打印文档</p>
      </header>

      <main className="workbench-grid">
        <section className="panel upload-panel no-print">
          <h2>上传区</h2>
          <label htmlFor="file-input" className="upload-dropzone" onDrop={onDrop} onDragOver={onDragOver}>
            <input
              id="file-input"
              type="file"
              multiple
              onChange={onFileChange}
              accept=".doc,.docx,.rtf,.xls,.xlsx,.csv,.ppt,.pptx,.md,.markdown,.html,.htm,.txt,.xml,.json,.rs,.py,.js,.ts,.epub,image/*"
            />
            <span>点击选择或拖拽文件到这里</span>
          </label>

          <div className="actions-row">
            <button type="button" onClick={startConversion} disabled={isConverting || selectedFiles.length === 0}>
              {isConverting ? "转换中" : "开始转换"}
            </button>
            <button type="button" onClick={clearAll} disabled={isConverting && selectedFiles.length > 0}>
              清空
            </button>
            <button type="button" onClick={printPreview} disabled={previewModel.printableSections.length === 0}>
              导出PDF
            </button>
            <button
              type="button"
              onClick={saveToDocumentPath}
              disabled={isSaving || previewModel.printableSections.length === 0}
            >
              {isSaving ? "保存中" : "保存到文档目录"}
            </button>
          </div>

          <p className="progress-line">{progressText}</p>
          <p className="progress-line">{saveProgressText}</p>
          {saveError ? (
            <p className="error-text">
              保存失败:command={saveError.command},chunkIndex={saveError.chunkIndex},message={saveError.message}
            </p>
          ) : null}
          {saveError ? (
            <button type="button" onClick={saveToDocumentPath} disabled={isSaving}>
              重试保存
            </button>
          ) : null}
          {lastSavedInfo && lastSavedInfo.savedPath ? (
            <p className="success-text">已保存:{lastSavedInfo.savedPath}</p>
          ) : null}

          <ul className="file-list">
            {selectedFiles.map((file) => (
              <li key={`${file.name}-${file.size}-${file.lastModified}`}>
                <span>{file.name}</span>
                <small>{Math.max(1, Math.round(file.size / 1024))}KB</small>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel status-panel no-print">
          <h2>转换状态</h2>
          <div className="summary-row">
            <span>总数:{documents.length}</span>
            <span>成功:{successCount}</span>
            <span>失败:{errorCount}</span>
          </div>

          <div className="status-list">
            {documents.length === 0 ? <p className="muted-text">暂无任务</p> : null}
            {documents.map((doc) => (
              <article key={doc.id} className={`status-item status-${doc.parseStatus}`}>
                <header>
                  <h3>{doc.name}</h3>
                  <span>{statusLabel(doc.parseStatus)}</span>
                </header>
                <p>类型:{doc.sourceType}</p>
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
        </section>

        <section className="panel preview-panel">
          <h2 className="no-print">合并预览</h2>
          <MergedPreview model={previewModel} />
        </section>
      </main>
    </div>
  );
}

export default App;
