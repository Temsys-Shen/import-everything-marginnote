import { pptxToHtml } from "@jvmr/pptx-to-html";
import { readAsArrayBuffer, sanitizeHtml, toParserError } from "./utils";

function wrapSlideHtml(fileName, slideIndex, slideHtml) {
  return `
    <article class="pptx-slide-shell" data-file-name="${fileName}" data-slide-index="${slideIndex + 1}">
      <div class="pptx-slide-frame">
        ${slideHtml}
      </div>
    </article>
  `;
}

export async function parsePptxFile(file, context = {}) {
  try {
    const { onProgress } = context;

    if (typeof onProgress === "function") {
      onProgress({ stage: "parse-pptx", current: 0, total: 1 });
    }

    const arrayBuffer = await readAsArrayBuffer(file);
    const slidesHtml = await pptxToHtml(arrayBuffer, {
      scaleToFit: true,
      letterbox: true,
    });

    if (!Array.isArray(slidesHtml) || slidesHtml.length === 0) {
      throw new Error("No slides were rendered from the PPTX file");
    }

    const sections = slidesHtml.map((slideHtml, index) => {
      if (typeof onProgress === "function") {
        onProgress({ stage: "render-pptx", current: index + 1, total: slidesHtml.length });
      }

      return {
        title: `${file.name} - Slide ${index + 1}`,
        html: sanitizeHtml(wrapSlideHtml(file.name, index, slideHtml), {
          mode: "presentation",
        }),
        pageBreakBefore: index === 0,
      };
    });

    return { sections };
  } catch (error) {
    throw toParserError({
      parser: "parsePptxFile",
      fileName: file.name,
      sourceType: "pptx",
      detail: error,
    });
  }
}
