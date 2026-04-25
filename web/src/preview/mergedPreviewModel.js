import { ParseStatus, toSectionId } from "../pipeline/documentModel";

export const DEFAULT_PREVIEW_SECTION_LIMIT = 6;

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
}

function buildEmptyPreviewModel() {
  return {
    generatedAt: new Date().toISOString(),
    totalSourceFiles: 0,
    successfulCount: 0,
    totalPrintableSections: 0,
    totalContentSections: 0,
    tocEntries: [],
    printableSections: [],
    contentSections: [],
  };
}

export function buildMergedPreviewModel(documents) {
  const successfulDocs = documents.filter((doc) => doc.parseStatus === ParseStatus.SUCCESS);

  const tocEntries = [];
  const printableSections = [];
  const contentSections = [];

  successfulDocs.forEach((doc, docIndex) => {
    const docAnchor = `${slugify(doc.name)}-${doc.id}`;
    tocEntries.push({
      id: doc.id,
      title: doc.name,
      anchor: docAnchor,
      sectionCount: doc.sections.length,
    });

    printableSections.push({
      type: "cover",
      id: `${doc.id}-cover`,
      anchor: docAnchor,
      title: doc.name,
      sourceType: doc.sourceType,
      index: docIndex + 1,
      total: successfulDocs.length,
    });

    doc.sections.forEach((section, sectionIndex) => {
      const normalizedSection = {
        type: "section",
        id: toSectionId(doc.id, sectionIndex),
        title: section.title,
        html: section.html,
        pageBreakBefore: section.pageBreakBefore,
      };

      printableSections.push(normalizedSection);
      contentSections.push(normalizedSection);
    });
  });

  return {
    generatedAt: new Date().toISOString(),
    totalSourceFiles: documents.length,
    successfulCount: successfulDocs.length,
    totalPrintableSections: printableSections.length,
    totalContentSections: contentSections.length,
    tocEntries,
    printableSections,
    contentSections,
  };
}

export function createMergedPreviewSlice(model, maxSections = DEFAULT_PREVIEW_SECTION_LIMIT) {
  const safeModel = model || buildEmptyPreviewModel();
  const safeLimit = Math.max(0, Number(maxSections) || 0);
  const visibleContentSections = safeModel.contentSections.slice(0, safeLimit);
  const hiddenCount = Math.max(safeModel.contentSections.length - visibleContentSections.length, 0);

  return {
    ...safeModel,
    contentSections: visibleContentSections,
    visibleContentSections: visibleContentSections.length,
    hiddenContentSections: hiddenCount,
    hasHiddenContentSections: hiddenCount > 0,
  };
}
