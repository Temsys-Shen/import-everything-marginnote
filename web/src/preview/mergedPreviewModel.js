import { ParseStatus, toSectionId } from "../pipeline/documentModel";

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
}

export function buildMergedPreviewModel(documents) {
  const successfulDocs = documents.filter((doc) => doc.parseStatus === ParseStatus.SUCCESS);

  const tocEntries = [];
  const printableSections = [];

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
      printableSections.push({
        type: "section",
        id: toSectionId(doc.id, sectionIndex),
        title: section.title,
        html: section.html,
        pageBreakBefore: section.pageBreakBefore,
      });
    });
  });

  return {
    generatedAt: new Date().toISOString(),
    totalSourceFiles: documents.length,
    successfulCount: successfulDocs.length,
    tocEntries,
    printableSections,
  };
}
