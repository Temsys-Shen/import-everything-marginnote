import hljs from "highlight.js";
import { marked } from "marked";
import katex from "katex";
import markedKatexExtension from "marked-katex-extension";
import { sanitizeHtml, escapeHtml } from "./utils";

let configured = false;

function normalizeMathBlocks(text) {
  return text.replace(/\$\$([\s\S]*?)\$\$/g, (match, content) => {
    const trimmed = content.trim();
    if (!trimmed) return match;
    if (!content.includes("\n")) return match;
    return `\n\n$$\n${trimmed}\n$$\n\n`;
  });
}

const KATEX_SANITIZE_CONFIG = {
  allowClass: true,
  ADD_TAGS: [
    "math", "mi", "mo", "mn", "msup", "msub", "mfrac", "msqrt",
    "mroot", "mrow", "mtext", "mspace", "mstyle", "mphantom",
    "merror", "mover", "munder", "munderover", "msubsup",
    "mmultiscripts", "mprescripts", "none", "mtd", "mtr", "mtable",
    "menclose", "mpadded",
  ],
  ADD_ATTR: [
    "class", "style",
    "mathvariant", "displaystyle", "rowspan", "columnspan",
    "rowalign", "columnalign", "framespacing", "frame",
    "linethickness", "scriptlevel", "lspace", "rspace",
    "stretchy", "symmetric", "maxsize", "minsize",
    "accent", "moveablelimits",
  ],
};

function configureMarked() {
  if (configured) {
    return;
  }

  marked.use(markedKatexExtension({
    katex,
    nonStandard: true,
  }));

  const renderer = new marked.Renderer();
  renderer.code = ({ text, lang }) => {
    const safeText = String(text || "");
    const language = (lang || "").trim().toLowerCase();

    if (language && hljs.getLanguage(language)) {
      const highlighted = hljs.highlight(safeText, { language }).value;
      return `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`;
    }

    const highlighted = hljs.highlightAuto(safeText).value;
    return `<pre><code class="hljs language-plaintext">${highlighted}</code></pre>`;
  };

  marked.setOptions({
    gfm: true,
    breaks: false,
    renderer,
  });

  configured = true;
}

export function renderMarkdownToHtml(markdown) {
  configureMarked();
  const normalized = normalizeMathBlocks(String(markdown || ""));
  const raw = marked.parse(normalized);
  return sanitizeHtml(String(raw || ""), KATEX_SANITIZE_CONFIG);
}

export function renderPlainPreformatted(text) {
  return `<pre class="plain-text-block">${escapeHtml(text)}</pre>`;
}
