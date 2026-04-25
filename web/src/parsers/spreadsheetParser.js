import * as XLSX from "xlsx";
import { readAsArrayBuffer, sanitizeHtml, toParserError } from "./utils";

export async function parseSpreadsheetFile(file) {
  try {
    const arrayBuffer = await readAsArrayBuffer(file);
    const workbook = XLSX.read(arrayBuffer, { type: "array" });

    const sections = workbook.SheetNames.map((sheetName, index) => {
      const worksheet = workbook.Sheets[sheetName];
      const html = XLSX.utils.sheet_to_html(worksheet);
      return {
        title: `${file.name} - ${sheetName}`,
        html: sanitizeHtml(html),
        pageBreakBefore: index === 0,
      };
    });

    if (sections.length === 0) {
      throw new Error("Workbook has no visible sheets");
    }

    return { sections };
  } catch (error) {
    throw toParserError({
      parser: "parseSpreadsheetFile",
      fileName: file.name,
      sourceType: "spreadsheet",
      detail: error,
    });
  }
}
