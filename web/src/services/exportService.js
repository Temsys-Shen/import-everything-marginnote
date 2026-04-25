import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { transferBinaryToBridge } from "./binaryTransferService";
import { sanitizePdfFileName } from "./exportConfigService";
import { applyAdaptiveLayout } from "./widthAdaptService";

const BRIDGE_COMMANDS = {
  INIT: "savePdfInit",
  CHUNK: "savePdfChunk",
  FINALIZE: "savePdfFinalize",
  ABORT: "savePdfAbort",
};

const EXPORT_PAGE_WIDTH = 794;
const EXPORT_PAGE_HEIGHT = 1123;

const QUALITY_PRESET_MAP = {
  1: { label: "低", scale: 1.0, jpegQuality: 0.58 },
  2: { label: "较低", scale: 1.25, jpegQuality: 0.68 },
  3: { label: "标准", scale: 1.5, jpegQuality: 0.78 },
  4: { label: "较高", scale: 1.75, jpegQuality: 0.86 },
  5: { label: "高", scale: 2.0, jpegQuality: 0.92 },
};

function createExportError({ command, chunkIndex = null, message, details = null }) {
  return {
    command,
    chunkIndex,
    message,
    details,
  };
}

export function getImageQualityPreset(level) {
  return QUALITY_PRESET_MAP[level] || QUALITY_PRESET_MAP[3];
}

async function waitForRenderStability() {
  await new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
  await new Promise((resolve) => window.requestAnimationFrame(() => resolve()));

  if (document.fonts && document.fonts.ready) {
    try {
      await document.fonts.ready;
    } catch (error) {
      console.log(`[ImportEverything] fonts ready wait failed: ${String(error)}`);
    }
  }
}

function createRenderHost() {
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-400vw";
  host.style.top = "0";
  host.style.width = `${EXPORT_PAGE_WIDTH}px`;
  host.style.opacity = "0";
  host.style.pointerEvents = "none";
  host.style.zIndex = "-1";
  host.style.background = "#ffffff";
  document.body.appendChild(host);
  return host;
}

function createPageFrame() {
  const frame = document.createElement("div");
  frame.style.position = "relative";
  frame.style.width = `${EXPORT_PAGE_WIDTH}px`;
  frame.style.height = `${EXPORT_PAGE_HEIGHT}px`;
  frame.style.overflow = "hidden";
  frame.style.background = "#ffffff";
  return frame;
}

function createPageContent(sourceElement) {
  const content = sourceElement.cloneNode(true);
  content.style.width = `${EXPORT_PAGE_WIDTH}px`;
  content.style.maxWidth = `${EXPORT_PAGE_WIDTH}px`;
  content.style.margin = "0";
  content.style.background = "#ffffff";
  return content;
}

function clearElementChildren(element) {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

function replaceElementChild(element, child) {
  clearElementChildren(element);
  element.appendChild(child);
}

function removeElement(element) {
  if (element && element.parentNode) {
    element.parentNode.removeChild(element);
  }
}

async function renderPageCanvas(frame, scale) {
  return html2canvas(frame, {
    backgroundColor: "#ffffff",
    scale,
    useCORS: true,
    allowTaint: true,
    logging: false,
    imageTimeout: 0,
    width: EXPORT_PAGE_WIDTH,
    height: EXPORT_PAGE_HEIGHT,
    windowWidth: EXPORT_PAGE_WIDTH,
    windowHeight: EXPORT_PAGE_HEIGHT,
    scrollX: 0,
    scrollY: 0,
  });
}

async function generatePdfBytesFromElement(element, imageQualityLevel, onMeasureError, onProgress) {
  const cleanupAdaptiveLayout = applyAdaptiveLayout(element, {
    onMeasureError,
  });

  const renderHost = createRenderHost();
  const pageFrame = createPageFrame();
  renderHost.appendChild(pageFrame);

  try {
    const measuredContent = createPageContent(element);
    renderHost.appendChild(measuredContent);
    await waitForRenderStability();

    const totalHeight = Math.max(
      EXPORT_PAGE_HEIGHT,
      Math.ceil(measuredContent.getBoundingClientRect().height || measuredContent.scrollHeight || 0),
    );
    renderHost.removeChild(measuredContent);

    const totalPages = Math.max(1, Math.ceil(totalHeight / EXPORT_PAGE_HEIGHT));
    const qualityPreset = getImageQualityPreset(imageQualityLevel);
    const pdf = new jsPDF({
      orientation: "p",
      unit: "px",
      format: [EXPORT_PAGE_WIDTH, EXPORT_PAGE_HEIGHT],
      compress: true,
      hotfixes: ["px_scaling"],
    });

    for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
      if (typeof onProgress === "function") {
        onProgress({
          phase: "render",
          message: `正在生成PDF ${pageIndex + 1}/${totalPages}`,
          current: pageIndex,
          total: totalPages,
          ratioHint: totalPages === 0 ? 0.2 : 0.12 + ((pageIndex / totalPages) * 0.5),
        });
      }

      const pageContent = createPageContent(element);
      pageContent.style.position = "absolute";
      pageContent.style.left = "0";
      pageContent.style.top = `${-pageIndex * EXPORT_PAGE_HEIGHT}px`;
      replaceElementChild(pageFrame, pageContent);

      await waitForRenderStability();
      const canvas = await renderPageCanvas(pageFrame, qualityPreset.scale);
      const imageData = canvas.toDataURL("image/jpeg", qualityPreset.jpegQuality);

      if (pageIndex > 0) {
        pdf.addPage([EXPORT_PAGE_WIDTH, EXPORT_PAGE_HEIGHT], "p");
      }

      pdf.addImage(imageData, "JPEG", 0, 0, EXPORT_PAGE_WIDTH, EXPORT_PAGE_HEIGHT, undefined, "FAST");
      canvas.width = 0;
      canvas.height = 0;
      clearElementChildren(pageFrame);
    }

    return new Uint8Array(pdf.output("arraybuffer"));
  } finally {
    cleanupAdaptiveLayout();
    removeElement(renderHost);
  }
}

export async function exportMergedPreviewToDocumentPath(options) {
  const {
    rootElement,
    fileName,
    imageQualityLevel,
    onProgress,
  } = options;

  if (!rootElement) {
    throw createExportError({
      command: "generatePdf",
      message: "Missing printable root element",
    });
  }

  const measureErrors = [];
  const pdfBytes = await generatePdfBytesFromElement(
    rootElement,
    imageQualityLevel,
    (errorInfo) => {
      measureErrors.push(errorInfo);
    },
    onProgress,
  );

  const finalResponse = await transferBinaryToBridge({
    bytes: pdfBytes,
    fileName: sanitizePdfFileName(fileName),
    mimeType: "application/pdf",
    commands: {
      init: BRIDGE_COMMANDS.INIT,
      chunk: BRIDGE_COMMANDS.CHUNK,
      finalize: BRIDGE_COMMANDS.FINALIZE,
      abort: BRIDGE_COMMANDS.ABORT,
    },
    buildFinalizePayload({ sessionId, totalChunks, expectedByteLength }) {
      return {
        sessionId,
        totalChunks,
        expectedByteLength,
        fileName: sanitizePdfFileName(fileName),
        mimeType: "application/pdf",
        imageQualityLevel,
      };
    },
    onProgress(progress) {
      if (typeof onProgress !== "function") {
        return;
      }

      if (progress.phase === "transfer") {
        onProgress({
          ...progress,
          message: `正在写入MN文档 ${progress.current}/${progress.total}`,
        });
        return;
      }

      onProgress(progress);
    },
  });

  if (typeof onProgress === "function") {
    onProgress({
      phase: "done",
      current: 1,
      total: 1,
      ratioHint: 1,
      message: "导入完成",
    });
  }

  if (measureErrors.length > 0) {
    finalResponse.data = {
      ...(finalResponse.data || {}),
      measureErrors,
    };
  }

  return finalResponse;
}
