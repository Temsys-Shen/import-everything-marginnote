import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { transferBinaryToBridge } from "./binaryTransferService";
import { sanitizePdfFileName } from "./exportConfigService";
import { applyAdaptiveLayout } from "./widthAdaptService";
import MNBridge from "../lib/mnBridge";

const BRIDGE_COMMANDS = {
  INIT: "savePdfInit",
  CHUNK: "savePdfChunk",
  FINALIZE: "savePdfFinalize",
  ABORT: "savePdfAbort",
};

const EXPORT_PAGE_WIDTH = 794;
const EXPORT_PAGE_HEIGHT = 1123;
const EXPORT_IMAGE_LOAD_TIMEOUT_MS = 8000;
const EXPORT_SLOW_IMAGE_WAIT_MS = 500;
const EXPORT_SLOW_PAGE_RENDER_MS = 400;
const EXPORT_IMAGE_MAX_DIMENSION_BY_QUALITY = {
  1: 1200,
  2: 1440,
  3: 1680,
  4: 1920,
  5: 2240,
};

const QUALITY_PRESET_MAP = {
  1: { label: "低", scale: 1.0, jpegQuality: 0.58 },
  2: { label: "较低", scale: 1.25, jpegQuality: 0.68 },
  3: { label: "标准", scale: 1.5, jpegQuality: 0.78 },
  4: { label: "较高", scale: 1.75, jpegQuality: 0.86 },
  5: { label: "高", scale: 2.0, jpegQuality: 0.92 },
};

const EXPORT_ZOOM_MIN = 50;
const EXPORT_ZOOM_MAX = 200;

function createExportError({ command, chunkIndex = null, message, details = null }) {
  return {
    command,
    chunkIndex,
    message,
    details,
  };
}

function getNowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }

  return Date.now();
}

function logExportEvent(event, details = {}) {
  console.log(`[ImportEverything][WebView][Export] ${event}`, details);
}

export function getImageQualityPreset(level) {
  return QUALITY_PRESET_MAP[level] || QUALITY_PRESET_MAP[3];
}

function getExportImageMaxDimension(level) {
  return EXPORT_IMAGE_MAX_DIMENSION_BY_QUALITY[level] || EXPORT_IMAGE_MAX_DIMENSION_BY_QUALITY[3];
}

function nextAnimationFrame() {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

async function waitForDocumentStability() {
  await nextAnimationFrame();
  await nextAnimationFrame();

  if (document.fonts && document.fonts.ready) {
    try {
      await document.fonts.ready;
    } catch (error) {
      console.log(`[ImportEverything] fonts ready wait failed: ${String(error)}`);
    }
  }
}

async function waitForPaintStability() {
  await nextAnimationFrame();
}

function isSafeImageSource(src) {
  const normalized = String(src || "");
  if (!normalized) {
    return false;
  }

  if (
    normalized.startsWith("data:")
    || normalized.startsWith("blob:")
    || normalized.startsWith("file:")
  ) {
    return true;
  }

  try {
    return new URL(normalized, document.baseURI).origin === window.location.origin;
  } catch (error) {
    return false;
  }
}

function getImageLoadTimeoutMs(src) {
  return EXPORT_IMAGE_LOAD_TIMEOUT_MS;
}

function waitForImageReady(image, timeoutMs = EXPORT_IMAGE_LOAD_TIMEOUT_MS) {
  if (!image) {
    return Promise.resolve({ status: "missing" });
  }

  if (image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
    return Promise.resolve({ status: "ready" });
  }

  return new Promise((resolve) => {
    let settled = false;
    let timerId = null;

    function cleanup() {
      image.removeEventListener("load", onLoad);
      image.removeEventListener("error", onError);
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
    }

    function finish(result) {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      resolve(result);
    }

    function onLoad() {
      finish({ status: "ready" });
    }

    function onError() {
      finish({ status: "error" });
    }

    image.addEventListener("load", onLoad, { once: true });
    image.addEventListener("error", onError, { once: true });

    timerId = window.setTimeout(() => {
      finish({ status: "timeout" });
    }, Math.max(1, Number(timeoutMs) || EXPORT_IMAGE_LOAD_TIMEOUT_MS));

    if (image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
      finish({ status: "ready" });
    }
  });
}

function canvasToBlobUrl(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to encode image canvas"));
        return;
      }

      resolve(URL.createObjectURL(blob));
    }, "image/jpeg", quality);
  });
}

async function downsampleImageToBlobUrl(image, maxDimension, quality) {
  const sourceWidth = Number(image.naturalWidth || image.width || 0);
  const sourceHeight = Number(image.naturalHeight || image.height || 0);
  if (!sourceWidth || !sourceHeight) {
    return null;
  }

  const largestSide = Math.max(sourceWidth, sourceHeight);
  if (largestSide <= maxDimension) {
    return null;
  }

  const scale = maxDimension / largestSide;
  const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
  const targetHeight = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Unable to acquire 2D context for image downsampling");
  }

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

  try {
    const blobUrl = await canvasToBlobUrl(canvas, quality);
    return {
      blobUrl,
      sourceWidth,
      sourceHeight,
      targetWidth,
      targetHeight,
    };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

async function optimizeExportImages(sourceElement, cloneElement, options = {}) {
  const maxDimension = Number(options.maxDimension || getExportImageMaxDimension(3));
  const jpegQuality = Number(options.jpegQuality || 0.8);
  const sourceImages = Array.from(sourceElement.querySelectorAll("img"));
  const cloneImages = Array.from(cloneElement.querySelectorAll("img"));
  const createdBlobUrls = [];
  const imageTiming = {
    waitedMs: 0,
    downsampledMs: 0,
  };
  const report = {
    totalImages: sourceImages.length,
    localImages: 0,
    remoteImages: 0,
    readyImages: 0,
    timedOutImages: 0,
    brokenImages: 0,
    skippedUnsafeImages: 0,
    downsampledImages: 0,
    largestSourceSide: 0,
  };

  try {
    const imageStates = await Promise.all(sourceImages.map(async (sourceImage, index) => {
      const sourceSrc = sourceImage ? String(sourceImage.currentSrc || sourceImage.src || "") : "";
      const timeoutMs = getImageLoadTimeoutMs(sourceSrc);
      const sourceWidth = Number(sourceImage && (sourceImage.naturalWidth || sourceImage.width) || 0);
      const sourceHeight = Number(sourceImage && (sourceImage.naturalHeight || sourceImage.height) || 0);
      const waitStartedAt = getNowMs();
      const readiness = await waitForImageReady(sourceImage, timeoutMs);
      const waitElapsedMs = Math.max(0, Math.round(getNowMs() - waitStartedAt));

      return {
        index,
        sourceImage,
        sourceSrc,
        sourceWidth,
        sourceHeight,
        readiness,
        waitElapsedMs,
        timeoutMs,
      };
    }));

    imageStates.forEach((state) => {
      if (!state.sourceImage) {
        return;
      }

      const isRemoteImage = /^https?:\/\//i.test(state.sourceSrc);
      if (isRemoteImage) {
        report.remoteImages += 1;
      } else {
        report.localImages += 1;
      }

      imageTiming.waitedMs += state.waitElapsedMs;
      if (state.waitElapsedMs >= EXPORT_SLOW_IMAGE_WAIT_MS) {
        logExportEvent("image-wait-slow", {
          index: state.index,
          waitMs: state.waitElapsedMs,
          timeoutMs: state.timeoutMs,
          status: state.readiness.status,
          src: state.sourceSrc.slice(0, 180),
        });
      }

      if (state.readiness.status === "ready") {
        report.readyImages += 1;
      } else if (state.readiness.status === "timeout") {
        report.timedOutImages += 1;
      } else if (state.readiness.status === "error") {
        report.brokenImages += 1;
      }
    });

    for (let index = 0; index < sourceImages.length; index += 1) {
      const sourceImage = sourceImages[index];
      const cloneImage = cloneImages[index];
      const state = imageStates[index];
      if (!sourceImage || !cloneImage || !state) {
        continue;
      }

      cloneImage.removeAttribute("srcset");
      cloneImage.removeAttribute("sizes");
      cloneImage.setAttribute("loading", "eager");

      const { sourceSrc, sourceWidth, sourceHeight, readiness } = state;
      report.largestSourceSide = Math.max(report.largestSourceSide, sourceWidth, sourceHeight);

      if (/^https?:\/\//i.test(sourceSrc)) {
        if (readiness.status === "ready") {
          try {
            const bridgeResponse = await MNBridge.send("fetchImageForExport", { url: sourceSrc });
            if (bridgeResponse && bridgeResponse.ok && bridgeResponse.data && bridgeResponse.data.data) {
              const base64Data = bridgeResponse.data.data;
              const mimeType = bridgeResponse.data.mimeType || "image/png";
              const binaryStr = atob(base64Data);
              const bytes = new Uint8Array(binaryStr.length);
              for (let i = 0; i < binaryStr.length; i++) {
                bytes[i] = binaryStr.charCodeAt(i);
              }
              const blob = new Blob([bytes], { type: mimeType });
              const blobUrl = URL.createObjectURL(blob);
              createdBlobUrls.push(blobUrl);
              cloneImage.src = blobUrl;
              report.downsampledImages += 1;
            }
          } catch (error) {
            console.log("[ImportEverything] optimizeExportImages bridge error:", error);
            report.skippedUnsafeImages += 1;
          }
        }
        continue;
      }

      const isLargeImage = Math.max(sourceWidth, sourceHeight) > maxDimension;
      if (!isLargeImage || !isSafeImageSource(sourceSrc) || readiness.status !== "ready") {
        if (isLargeImage && !isSafeImageSource(sourceSrc)) {
          report.skippedUnsafeImages += 1;
        }

        continue;
      }

      const downsampleStartedAt = getNowMs();
      const downsampled = await downsampleImageToBlobUrl(sourceImage, maxDimension, jpegQuality);
      const downsampleElapsedMs = Math.max(0, Math.round(getNowMs() - downsampleStartedAt));
      imageTiming.downsampledMs += downsampleElapsedMs;
      if (downsampleElapsedMs >= EXPORT_SLOW_IMAGE_WAIT_MS) {
        logExportEvent("image-downsample-slow", {
          index,
          durationMs: downsampleElapsedMs,
          sourceWidth: sourceWidth || null,
          sourceHeight: sourceHeight || null,
          targetWidth: downsampled ? downsampled.targetWidth : null,
          targetHeight: downsampled ? downsampled.targetHeight : null,
          src: String(sourceSrc).slice(0, 180),
        });
      }

      if (!downsampled) {
        continue;
      }

      createdBlobUrls.push(downsampled.blobUrl);
      cloneImage.src = downsampled.blobUrl;
      cloneImage.removeAttribute("srcset");
      cloneImage.removeAttribute("sizes");
      report.downsampledImages += 1;
    }

    return {
      cloneElement,
      createdBlobUrls,
      report,
      imageTiming,
    };
  } catch (error) {
    clearTrackedObjectURLs(createdBlobUrls);
    throw error;
  }
}

function clearTrackedObjectURLs(urls) {
  (Array.isArray(urls) ? urls : []).forEach((objectURL) => {
    try {
      URL.revokeObjectURL(objectURL);
    } catch (error) {
      console.log(`[ImportEverything] revokeObjectURL failed: ${String(error)}`);
    }
  });
}

function createExportSandbox() {
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-400vw";
  host.style.top = "0";
  host.style.width = `${EXPORT_PAGE_WIDTH}px`;
  host.style.opacity = "0";
  host.style.pointerEvents = "none";
  host.style.zIndex = "-1";
  host.style.background = "#ffffff";
  host.style.contain = "layout paint style";
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
  frame.style.contain = "layout paint style";
  return frame;
}

function normalizeExportZoomLevel(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return 100;
  }

  return Math.max(EXPORT_ZOOM_MIN, Math.min(EXPORT_ZOOM_MAX, Math.round(numericValue)));
}

function createExportZoomLayer(zoomLevel) {
  const zoomScale = normalizeExportZoomLevel(zoomLevel) / 100;
  const layer = document.createElement("div");
  layer.style.position = "absolute";
  layer.style.left = "0";
  layer.style.top = "0";
  layer.style.width = `${EXPORT_PAGE_WIDTH}px`;
  layer.style.transform = `scale(${zoomScale})`;
  layer.style.transformOrigin = "top left";
  layer.style.background = "#ffffff";
  return {
    layer,
    zoomScale,
  };
}

function removeElement(element) {
  if (element && element.parentNode) {
    element.parentNode.removeChild(element);
  }
}

async function prepareExportContent(sourceElement, options = {}) {
  const content = sourceElement.cloneNode(true);
  content.style.width = `${EXPORT_PAGE_WIDTH}px`;
  content.style.maxWidth = `${EXPORT_PAGE_WIDTH}px`;
  content.style.margin = "0";
  content.style.background = "#ffffff";
  content.style.position = "relative";
  content.style.left = "0";
  content.style.top = "0";

  return optimizeExportImages(sourceElement, content, options);
}

async function renderPageCanvas(frame, scale) {
  return html2canvas(frame, {
    backgroundColor: "#ffffff",
    scale,
    useCORS: true,
    allowTaint: true,
    logging: false,
    imageTimeout: EXPORT_IMAGE_LOAD_TIMEOUT_MS,
    width: EXPORT_PAGE_WIDTH,
    height: EXPORT_PAGE_HEIGHT,
    windowWidth: EXPORT_PAGE_WIDTH,
    windowHeight: EXPORT_PAGE_HEIGHT,
    scrollX: 0,
    scrollY: 0,
  });
}

async function generatePdfBytesFromElement(
  element,
  imageQualityLevel,
  exportZoomLevel,
  onMeasureError,
  onProgress,
) {
  const exportStartedAt = getNowMs();
  const renderHost = createExportSandbox();
  const pageFrame = createPageFrame();
  renderHost.appendChild(pageFrame);
  const qualityPreset = getImageQualityPreset(imageQualityLevel);
  const normalizedExportZoomLevel = normalizeExportZoomLevel(exportZoomLevel);
  const { layer: exportZoomLayer, zoomScale: exportZoomScale } = createExportZoomLayer(
    normalizedExportZoomLevel,
  );
  const createdBlobUrls = [];
  let cleanupExportAdaptiveLayout = () => {};

  try {
    logExportEvent("start", {
      imageQualityLevel,
      exportZoomLevel: normalizedExportZoomLevel,
      pageWidth: EXPORT_PAGE_WIDTH,
      pageHeight: EXPORT_PAGE_HEIGHT,
    });

    const prepared = await prepareExportContent(element, {
      maxDimension: getExportImageMaxDimension(imageQualityLevel),
      jpegQuality: qualityPreset.jpegQuality,
    });
    const exportContent = prepared.cloneElement;
    createdBlobUrls.push(...prepared.createdBlobUrls);

    logExportEvent("image-summary", {
      ...prepared.report,
      waitedMs: prepared.imageTiming.waitedMs,
      downsampledMs: prepared.imageTiming.downsampledMs,
      maxDimension: getExportImageMaxDimension(imageQualityLevel),
      jpegQuality: qualityPreset.jpegQuality,
    });

    renderHost.appendChild(exportContent);
    cleanupExportAdaptiveLayout = applyAdaptiveLayout(exportContent, {
      onMeasureError,
    });

    const documentStabilityStartedAt = getNowMs();
    await waitForDocumentStability();
    logExportEvent("document-stability", {
      durationMs: Math.max(0, Math.round(getNowMs() - documentStabilityStartedAt)),
    });

    const measureStartedAt = getNowMs();
    const exportContentHeight = Math.ceil(
      exportContent.getBoundingClientRect().height || exportContent.scrollHeight || 0,
    );
    const totalHeight = Math.max(
      EXPORT_PAGE_HEIGHT,
      Math.ceil(exportContentHeight * exportZoomScale),
    );
    const measureElapsedMs = Math.max(0, Math.round(getNowMs() - measureStartedAt));

    renderHost.removeChild(exportContent);
    exportZoomLayer.appendChild(exportContent);
    pageFrame.appendChild(exportZoomLayer);
    exportContent.style.position = "relative";
    exportContent.style.left = "0";
    exportContent.style.top = "0";

    const totalPages = Math.max(1, Math.ceil(totalHeight / EXPORT_PAGE_HEIGHT));
    logExportEvent("layout-ready", {
      totalHeight,
      exportContentHeight,
      totalPages,
      exportZoomLevel: normalizedExportZoomLevel,
      measureMs: measureElapsedMs,
      setupMs: Math.max(0, Math.round(getNowMs() - exportStartedAt)),
    });
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

      const pageStartedAt = getNowMs();
      exportZoomLayer.style.top = `${-pageIndex * EXPORT_PAGE_HEIGHT}px`;
      await waitForPaintStability();

      const canvas = await renderPageCanvas(pageFrame, qualityPreset.scale);
      console.log(`[ImportEverything] html2canvas: ${canvas.width}x${canvas.height}, src size=${canvas.toDataURL("image/png").length}`);
      const imageData = canvas.toDataURL("image/jpeg", qualityPreset.jpegQuality);

      if (pageIndex > 0) {
        pdf.addPage([EXPORT_PAGE_WIDTH, EXPORT_PAGE_HEIGHT], "p");
      }

      pdf.addImage(imageData, "JPEG", 0, 0, EXPORT_PAGE_WIDTH, EXPORT_PAGE_HEIGHT, undefined, "FAST");
      canvas.width = 0;
      canvas.height = 0;

      const pageElapsedMs = Math.max(0, Math.round(getNowMs() - pageStartedAt));
      logExportEvent(pageElapsedMs >= EXPORT_SLOW_PAGE_RENDER_MS ? "page-render-slow" : "page-render", {
        page: pageIndex + 1,
        totalPages,
        durationMs: pageElapsedMs,
      });
    }

    console.log(`[ImportEverything] export report: ${JSON.stringify(prepared.report)}`);
    logExportEvent("finish", {
      totalPages,
      totalImages: prepared.report.totalImages,
      downsampledImages: prepared.report.downsampledImages,
      timedOutImages: prepared.report.timedOutImages,
      brokenImages: prepared.report.brokenImages,
      totalDurationMs: Math.max(0, Math.round(getNowMs() - exportStartedAt)),
    });

    return new Uint8Array(pdf.output("arraybuffer"));
  } finally {
    clearTrackedObjectURLs(createdBlobUrls);
    cleanupExportAdaptiveLayout();
    removeElement(renderHost);
  }
}

export async function exportMergedPreviewToDocumentPath(options) {
  const {
    rootElement,
    fileName,
    imageQualityLevel,
    exportZoomLevel,
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
    exportZoomLevel,
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
        exportZoomLevel: normalizeExportZoomLevel(exportZoomLevel),
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
