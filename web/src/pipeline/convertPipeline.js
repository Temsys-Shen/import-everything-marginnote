import { parseBySourceType } from "../parsers";
import { pauseForPaint } from "../parsers/utils";
import {
  ParseStatus,
  createEmptyNormalizedDocument,
  nextDocumentId,
  toErrorShape,
} from "./documentModel";
import {
  assertSupportedSourceType,
  detectSourceType,
} from "./fileTypes";

export function buildInitialDocuments(files) {
  return files.map((file) => {
    const sourceType = detectSourceType(file);
    return createEmptyNormalizedDocument({
      id: nextDocumentId(),
      name: file.name,
      sourceType,
    });
  });
}

function updateDocumentAt(docs, index, updater) {
  return docs.map((doc, i) => {
    if (i !== index) return doc;
    return updater(doc);
  });
}

export async function runConversionPipeline(files, options = {}) {
  const { onDocumentsChange, onProgress } = options;
  let documents = buildInitialDocuments(files);

  if (typeof onDocumentsChange === "function") {
    onDocumentsChange(documents);
  }

  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    const currentDoc = documents[i];

    documents = updateDocumentAt(documents, i, (doc) => ({
      ...doc,
      parseStatus: ParseStatus.PROCESSING,
      error: null,
    }));

    if (typeof onDocumentsChange === "function") {
      onDocumentsChange(documents);
    }

    try {
      assertSupportedSourceType(currentDoc.sourceType, file);

      const result = await parseBySourceType(currentDoc.sourceType, file, {
        onProgress(progressDetail) {
          if (typeof onProgress === "function") {
            onProgress({
              fileIndex: i,
              fileName: file.name,
              sourceType: currentDoc.sourceType,
              ...progressDetail,
            });
          }
        },
      });

      documents = updateDocumentAt(documents, i, (doc) => ({
        ...doc,
        parseStatus: ParseStatus.SUCCESS,
        sections: result.sections,
        error: null,
        warnings: result.warnings || [],
      }));
    } catch (error) {
      documents = updateDocumentAt(documents, i, (doc) => ({
        ...doc,
        parseStatus: ParseStatus.ERROR,
        error: toErrorShape(error),
        sections: [],
      }));
    }

    if (typeof onDocumentsChange === "function") {
      onDocumentsChange(documents);
    }

    await pauseForPaint();
  }

  return documents;
}
