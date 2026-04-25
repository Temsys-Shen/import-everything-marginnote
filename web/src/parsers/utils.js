import DOMPurify from "dompurify";

function buildSanitizeConfig(options = {}) {
  const allowClass = options.allowClass === true;
  const richHtmlConfig = {
    USE_PROFILES: { html: true, svg: true, svgFilters: true },
    ADD_ATTR: ["style", "class"],
    ALLOW_DATA_ATTR: true,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  };

  if (options.mode === "presentation") {
    return richHtmlConfig;
  }

  if (options.mode === "rich-document") {
    return {
      ...richHtmlConfig,
      ADD_TAGS: ["style"],
    };
  }

  const config = {
    USE_PROFILES: { html: true },
  };

  if (allowClass) {
    config.ADD_ATTR = ["class"];
  }

  return config;
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
