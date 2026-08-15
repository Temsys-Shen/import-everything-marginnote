import { escapeHtml, toParserError } from "./utils";
import { registerObjectURLForFile } from "./objectUrlRegistry";

export async function parseImageFile(file) {
  try {
    const objectURL = registerObjectURLForFile(file, URL.createObjectURL(file));
    return {
      sections: [
        {
          title: file.name,
          html: `<figure class="image-figure"><img src="${objectURL}" alt="${escapeHtml(file.name)}" /></figure>`,
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
