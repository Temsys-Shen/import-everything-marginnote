const COMMON_CJK_STACK = [
  "PingFang SC",
  "Hiragino Sans GB",
  "Microsoft YaHei",
  "Noto Sans CJK SC",
];

const COMMON_WESTERN_STACK = [
  "Avenir Next",
  "Helvetica Neue",
  "Arial",
];

const COMMON_MONO_STACK = [
  "SF Mono",
  "Menlo",
  "Consolas",
  "Liberation Mono",
];

function quoteFontFamily(name) {
  return /[\s"']/.test(name) ? `"${String(name).replace(/"/g, '\\"')}"` : String(name);
}

function uniqueFamilies(fontRegistry) {
  const seen = new Set();
  const result = [];

  fontRegistry.forEach((font) => {
    const family = String(font.fontFamily || "").trim();
    if (!family || seen.has(family)) {
      return;
    }
    seen.add(family);
    result.push(family);
  });

  return result;
}

function mimeTypeToFontFormat(mimeType) {
  if (mimeType === "font/ttf") return "truetype";
  if (mimeType === "font/otf") return "opentype";
  if (mimeType === "font/woff") return "woff";
  if (mimeType === "font/woff2") return "woff2";
  return "truetype";
}

function scopeSelectorList(selectors, scopeSelector) {
  return selectors
    .split(",")
    .map((selector) => selector.trim())
    .filter(Boolean)
    .map((selector) => {
      if (selector.startsWith(scopeSelector)) {
        return selector;
      }
      if (selector === ":root" || selector === "html" || selector === "body") {
        return scopeSelector;
      }
      if (selector.includes(":root")) {
        return selector.replace(/:root/g, scopeSelector);
      }
      return `${scopeSelector} ${selector}`;
    })
    .join(", ");
}

function scopeCssText(cssText, scopeSelector) {
  return String(cssText || "").replace(/(^|})\s*([^@{}][^{}]*)\{/g, (match, boundary, selectors) => {
    const scopedSelectors = scopeSelectorList(selectors, scopeSelector);
    return `${boundary}\n${scopedSelectors} {`;
  });
}

export function buildFontRegistry(loadedFonts) {
  return Array.isArray(loadedFonts)
    ? loadedFonts
      .filter((font) => font && font.base64 && font.family)
      .map((font) => ({
        id: font.id,
        fontFamily: String(font.family),
        fontWeight: Number(font.weight || 400),
        fontStyle: String(font.style || "normal"),
        fontBase64: String(font.base64),
        mimeType: String(font.mimeType || "application/octet-stream"),
        builtin: false,
      }))
    : [];
}

export function buildFontStacks(fontRegistry) {
  const preferredFamilies = uniqueFamilies(fontRegistry);

  return {
    body: preferredFamilies
      .concat(COMMON_CJK_STACK)
      .concat(COMMON_WESTERN_STACK)
      .concat(["sans-serif"])
      .map(quoteFontFamily)
      .join(", "),
    heading: preferredFamilies
      .concat(COMMON_CJK_STACK)
      .concat(COMMON_WESTERN_STACK)
      .concat(["sans-serif"])
      .map(quoteFontFamily)
      .join(", "),
    mono: COMMON_MONO_STACK
      .concat(["monospace"])
      .map(quoteFontFamily)
      .join(", "),
  };
}

export function buildFontFaceCss(fontRegistry) {
  return fontRegistry
    .filter((font) => font.fontBase64)
    .map((font) => [
      "@font-face {",
      `  font-family: ${quoteFontFamily(font.fontFamily)};`,
      `  src: url(data:${font.mimeType || "application/octet-stream"};base64,${font.fontBase64}) format("${mimeTypeToFontFormat(font.mimeType)}");`,
      `  font-weight: ${Number(font.fontWeight || 400)};`,
      `  font-style: ${String(font.fontStyle || "normal")};`,
      "  font-display: swap;",
      "}",
    ].join("\n"))
    .join("\n\n");
}

export function buildScopedThemeCss(options) {
  const {
    styleId,
    styleCss,
    fontRegistry,
  } = options;

  const safeStyleId = String(styleId || "default");
  const scopeSelector = `[data-export-theme-root="true"][data-export-style-id="${safeStyleId}"]`;
  const stacks = buildFontStacks(fontRegistry);

  const baseCss = `
:root {
  --preview-page-bg: #ffffff;
  --preview-text-color: #182018;
  --preview-muted-color: #687363;
  --preview-heading-color: #122418;
  --preview-line-color: #d9e1d8;
  --preview-block-bg: #ffffff;
  --preview-code-bg: #142118;
  --preview-code-color: #f3f6f2;
  --preview-code-muted-color: #8ea19a;
  --preview-code-keyword-color: #7dd3b0;
  --preview-code-string-color: #f4d38b;
  --preview-code-number-color: #f2a97d;
  --preview-code-title-color: #8cb7ff;
  --preview-code-attr-color: #b7e08a;
  --preview-code-variable-color: #f1b2d0;
  --preview-accent-color: #1f6a49;
  --preview-cover-align: left;
  --preview-body-font-stack: ${stacks.body};
  --preview-heading-font-stack: ${stacks.heading};
  --preview-mono-font-stack: ${stacks.mono};
}

.themed-document {
  color: var(--preview-text-color);
  font-family: var(--preview-body-font-stack);
}

.themed-document .print-block {
  background: var(--preview-block-bg);
}

.themed-document .doc-cover {
  text-align: var(--preview-cover-align);
}

.themed-document .doc-cover h3,
.themed-document .content-section h4 {
  color: var(--preview-heading-color);
  font-family: var(--preview-heading-font-stack);
}

.themed-document .doc-cover p,
.themed-document .doc-order,
.themed-document .toc-page p {
  color: var(--preview-muted-color);
}

.themed-document .content-html,
.themed-document .content-html p,
.themed-document .content-html li,
.themed-document .content-html td,
.themed-document .content-html th {
  color: var(--preview-text-color);
  font-family: inherit;
}

.themed-document .content-html a {
  color: var(--preview-accent-color);
}

.themed-document .content-html pre,
.themed-document .content-html code,
.themed-document .content-html kbd,
.themed-document .content-html samp {
  font-family: var(--preview-mono-font-stack);
  font-variant-ligatures: none;
  letter-spacing: 0;
  word-spacing: 0;
}

.themed-document .content-html pre {
  background: var(--preview-code-bg);
  color: var(--preview-code-color);
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: normal;
  overflow-wrap: normal;
  text-align: left;
  tab-size: 2;
}

.themed-document .content-html pre code,
.themed-document .content-html .hljs,
.themed-document .content-html .plain-text-block {
  display: block;
  white-space: inherit;
  word-break: inherit;
  overflow-wrap: inherit;
  text-align: inherit;
}

.themed-document .content-html .hljs {
  background: transparent;
  color: var(--preview-code-color);
}

.themed-document .content-html .hljs-comment,
.themed-document .content-html .hljs-quote,
.themed-document .content-html .hljs-doctag {
  color: var(--preview-code-muted-color);
}

.themed-document .content-html .hljs-keyword,
.themed-document .content-html .hljs-selector-tag,
.themed-document .content-html .hljs-meta .hljs-keyword {
  color: var(--preview-code-keyword-color);
}

.themed-document .content-html .hljs-string,
.themed-document .content-html .hljs-regexp,
.themed-document .content-html .hljs-addition,
.themed-document .content-html .hljs-attribute,
.themed-document .content-html .hljs-template-tag {
  color: var(--preview-code-string-color);
}

.themed-document .content-html .hljs-number,
.themed-document .content-html .hljs-literal {
  color: var(--preview-code-number-color);
}

.themed-document .content-html .hljs-title,
.themed-document .content-html .hljs-title.class_,
.themed-document .content-html .hljs-title.function_,
.themed-document .content-html .hljs-section {
  color: var(--preview-code-title-color);
}

.themed-document .content-html .hljs-attr,
.themed-document .content-html .hljs-selector-attr,
.themed-document .content-html .hljs-selector-class,
.themed-document .content-html .hljs-selector-id,
.themed-document .content-html .hljs-tag,
.themed-document .content-html .hljs-name {
  color: var(--preview-code-attr-color);
}

.themed-document .content-html .hljs-variable,
.themed-document .content-html .hljs-template-variable,
.themed-document .content-html .hljs-symbol,
.themed-document .content-html .hljs-bullet,
.themed-document .content-html .hljs-subst {
  color: var(--preview-code-variable-color);
}

.themed-document .content-html table,
.themed-document .content-html th,
.themed-document .content-html td {
  border-color: var(--preview-line-color);
}
  `;

  return [
    buildFontFaceCss(fontRegistry),
    scopeCssText(baseCss, scopeSelector),
    scopeCssText(styleCss, scopeSelector),
  ].filter(Boolean).join("\n\n");
}
