import { escapeHtml, toParserError } from "./utils";

export async function parseImageFile(file) {
  try {
    const objectURL = URL.createObjectURL(file);
    return {
      sections: [
        {
          title: file.name,
          html: `<figure class="image-figure"><img src="${objectURL}" alt="${escapeHtml(file.name)}" /><figcaption>${escapeHtml(file.name)}</figcaption></figure>`,
          pageBreakBefore: true,
        },
      ],
    };
  } catch (error) {
    throw toParserError({
      parser: "parseImageFile",
      fileName: file.name,
      sourceType: "image",
      detail: error,
    });
  }
}
