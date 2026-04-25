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
  resolveSourceTypeForConversion,
} from "./fileTypes";
import { enrichConversionProgress } from "../progress/progressModel";

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
  const totalFiles = files.length;

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

    if (typeof onProgress === "function") {
      onProgress(enrichConversionProgress({
        fileIndex: i,
        fileName: file.name,
        sourceType: currentDoc.sourceType,
        stage: "prepare",
        current: 0,
        total: 1,
      }, totalFiles));
    }

    try {
      const resolvedSourceType = await resolveSourceTypeForConversion(file, currentDoc.sourceType);

      if (resolvedSourceType !== currentDoc.sourceType) {
        documents = updateDocumentAt(documents, i, (doc) => ({
          ...doc,
          sourceType: resolvedSourceType,
        }));

        if (typeof onDocumentsChange === "function") {
          onDocumentsChange(documents);
        }
      }

      assertSupportedSourceType(resolvedSourceType, file);

      const result = await parseBySourceType(resolvedSourceType, file, {
        onProgress(progressDetail) {
          if (typeof onProgress === "function") {
            onProgress(enrichConversionProgress({
              fileIndex: i,
              fileName: file.name,
              sourceType: resolvedSourceType,
              ...progressDetail,
            }, totalFiles));
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
