import { getDefaultEngineId, getEngine, parseWithEngine } from "../engines/engineRegistry";
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

function resolveEngineId(sourceType, engineSelections) {
  if (!engineSelections) return getDefaultEngineId(sourceType);
  const selected = engineSelections instanceof Map
    ? engineSelections.get(sourceType)
    : engineSelections[sourceType];
  return selected || getDefaultEngineId(sourceType);
}

export function buildInitialDocuments(files) {
  return files.map((file) => {
    const sourceType = detectSourceType(file);
    return createEmptyNormalizedDocument({
      id: nextDocumentId(),
      name: file.name,
      sourceType,
      engineId: getDefaultEngineId(sourceType),
    });
  });
}

function updateDocumentAt(docs, index, updater) {
  return docs.map((doc, i) => {
    if (i !== index) return doc;
    return updater(doc);
  });
}

async function convertSingleFile(file, documents, index, options) {
  const { engineSelections, totalFiles, onDocumentsChange, onProgress } = options;
  const currentDoc = documents[index];

  documents = updateDocumentAt(documents, index, (doc) => ({
    ...doc,
    parseStatus: ParseStatus.PROCESSING,
    error: null,
  }));
  if (onDocumentsChange) onDocumentsChange(documents);

  if (onProgress) {
    onProgress(enrichConversionProgress({
      fileIndex: index,
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
      documents = updateDocumentAt(documents, index, (doc) => ({ ...doc, sourceType: resolvedSourceType }));
      if (onDocumentsChange) onDocumentsChange(documents);
    }

    assertSupportedSourceType(resolvedSourceType, file);

    const engineId = resolveEngineId(resolvedSourceType, engineSelections);
    const engine = getEngine(engineId);
    if (!engine) {
      throw new Error(`Conversion engine "${engineId}" is not available for ${resolvedSourceType}`);
    }

    documents = updateDocumentAt(documents, index, (doc) => ({ ...doc, engineId }));
    if (onDocumentsChange) onDocumentsChange(documents);

    const result = await parseWithEngine(engineId, resolvedSourceType, file, {
      onProgress(progressDetail) {
        if (onProgress) {
          onProgress(enrichConversionProgress({
            fileIndex: index,
            fileName: file.name,
            sourceType: resolvedSourceType,
            ...progressDetail,
          }, totalFiles));
        }
      },
    });

    documents = updateDocumentAt(documents, index, (doc) => ({
      ...doc,
      parseStatus: ParseStatus.SUCCESS,
      sections: result.sections,
      error: null,
      warnings: result.warnings || [],
    }));
  } catch (error) {
    documents = updateDocumentAt(documents, index, (doc) => ({
      ...doc,
      parseStatus: ParseStatus.ERROR,
      error: toErrorShape(error),
      sections: [],
    }));
  }

  if (onDocumentsChange) onDocumentsChange(documents);
  return documents;
}

export async function runConversionPipeline(files, options = {}) {
  const { onDocumentsChange, onProgress } = options;
  let documents = buildInitialDocuments(files);
  const totalFiles = files.length;

  if (onDocumentsChange) onDocumentsChange(documents);

  for (let i = 0; i < files.length; i += 1) {
    documents = await convertSingleFile(files[i], documents, i, {
      ...options,
      totalFiles,
    });
    await pauseForPaint();
  }

  return documents;
}

export async function reconvertBySourceTypes(files, documents, sourceTypes, options = {}) {
  const { onDocumentsChange, onProgress, engineSelections } = options;
  const totalFiles = files.length;
  let updatedDocs = [...documents];

  for (let i = 0; i < files.length; i += 1) {
    const currentDoc = updatedDocs[i];
    if (!sourceTypes.includes(currentDoc.sourceType)) continue;

    updatedDocs = await convertSingleFile(files[i], updatedDocs, i, {
      ...options,
      totalFiles,
    });
    await pauseForPaint();
  }

  return updatedDocs;
}
