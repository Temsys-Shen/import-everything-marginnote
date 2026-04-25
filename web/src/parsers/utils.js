import DOMPurify from "dompurify";

export function sanitizeHtml(html) {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
  });
}

export function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function toParserError({ parser, fileName, sourceType, detail }) {
  const detailText = detail instanceof Error ? detail.message : String(detail);
  return new Error(`[${parser}] Failed on ${fileName} (${sourceType}): ${detailText}`);
}

export function readAsArrayBuffer(file) {
  return file.arrayBuffer();
}

export function readAsText(file) {
  return file.text();
}

export function pauseForPaint() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
