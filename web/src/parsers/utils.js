import DOMPurify from "dompurify";

function buildSanitizeConfig(options = {}) {
  if (options.mode === "presentation") {
    return {
      USE_PROFILES: { html: true, svg: true, svgFilters: true },
      ADD_ATTR: ["style", "class"],
      ALLOW_DATA_ATTR: true,
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    };
  }

  return {
    USE_PROFILES: { html: true },
  };
}

export function sanitizeHtml(html, options = {}) {
  return DOMPurify.sanitize(html, buildSanitizeConfig(options));
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
