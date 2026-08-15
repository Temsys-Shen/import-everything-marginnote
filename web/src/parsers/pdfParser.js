import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import "pdfjs-dist/legacy/build/pdf.worker.mjs";
import { escapeHtml, readAsArrayBuffer, sanitizeHtml, toParserError } from "./utils";

const PDF_RENDER_DEFAULT_SCALE = 2;
const PDF_RENDER_MAX_DIMENSION = 1600;
const PDF_JPEG_QUALITY = 0.88;

function renderScaleForViewport(viewport) {
  const longestSide = Math.max(viewport.width, viewport.height);
  if (!Number.isFinite(longestSide) || longestSide <= 0) {
    return PDF_RENDER_DEFAULT_SCALE;
  }
  return Math.max(1, Math.min(PDF_RENDER_DEFAULT_SCALE, PDF_RENDER_MAX_DIMENSION / longestSide));
}

async function renderPdfPageToDataUrl(pdf, pageNumber) {
  const page = await pdf.getPage(pageNumber);
  try {
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = renderScaleForViewport(baseViewport);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const renderTask = page.render({
      canvasContext: context,
      viewport,
      canvas,
    });
    await renderTask.promise;
    const dataUrl = canvas.toDataURL("image/jpeg", PDF_JPEG_QUALITY);
    canvas.width = 0;
    canvas.height = 0;
    return dataUrl;
  } finally {
    page.cleanup();
  }
}

export async function parsePdfFile(file, context = {}) {
  try {
    const { onProgress } = context;
    if (typeof onProgress === "function") {
      onProgress({ stage: "parse-pdf", current: 0, total: 1 });
    }

    const arrayBuffer = await readAsArrayBuffer(file);
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    const totalPages = pdf.numPages;
    if (totalPages <= 0) {
      throw new Error("PDF has no pages");
    }

    const sections = [];
    try {
      for (let index = 0; index < totalPages; index += 1) {
        if (typeof onProgress === "function") {
          onProgress({ stage: "render-pdf", current: index + 1, total: totalPages });
        }

        const dataUrl = await renderPdfPageToDataUrl(pdf, index + 1);
        const pageTitle = `${file.name} - Page ${index + 1}`;
        sections.push({
          title: pageTitle,
          html: sanitizeHtml(
            `<figure class="image-figure pdf-page-figure"><img src="${dataUrl}" alt="${escapeHtml(pageTitle)}" /></figure>`,
            { mode: "presentation" },
          ),
          pageBreakBefore: index === 0,
        });
      }
    } finally {
      await loadingTask.destroy();
    }

    return { sections };
  } catch (error) {
    throw toParserError({
      parser: "parsePdfFile",
      fileName: file.name,
      sourceType: "pdf",
      detail: error,
    });
  }
}
