import hljs from "highlight.js";
import { marked } from "marked";
import { sanitizeHtml, escapeHtml } from "./utils";

let configured = false;

function configureMarked() {
  if (configured) {
    return;
  }

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
  const raw = marked.parse(String(markdown || ""));
  return sanitizeHtml(String(raw || ""));
}

export function renderPlainPreformatted(text) {
  return `<pre class="plain-text-block">${escapeHtml(text)}</pre>`;
}
