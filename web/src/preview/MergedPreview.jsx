import {
  DEFAULT_IMAGE_DISPLAY_PRESET_ID,
  normalizeImageDisplayPresetId,
} from "./imageDisplayPresets";

function renderContentSection(section) {
  return (
    <section
      key={section.id}
      className={`print-block content-section ${section.pageBreakBefore ? "print-page-break" : ""}`}
    >
      <h4>{section.title}</h4>
      <div
        className="content-html"
        dangerouslySetInnerHTML={{ __html: section.html }}
      />
    </section>
  );
}

function MergedPreview({
  model,
  variant = "export",
  rootId = "print-root",
  className = "",
  emptyText = "暂无可预览内容。请先上传并转换文件。",
  styleId = "default",
  imagePresetId = DEFAULT_IMAGE_DISPLAY_PRESET_ID,
}) {
  const panelSections = Array.isArray(model.contentSections)
    ? model.contentSections
    : model.printableSections.filter((section) => section.type === "section");

  const isPanel = variant === "panel";
  const sections = panelSections;
  const normalizedImagePresetId = normalizeImageDisplayPresetId(imagePresetId);

  if (sections.length === 0) {
    return <p className="muted-text">{emptyText}</p>;
  }

  if (isPanel) {
    return (
      <div
        className={`merged-preview themed-document ${className}`.trim()}
        id={rootId}
        data-export-theme-root="true"
        data-export-style-id={styleId}
        data-image-preset-id={normalizedImagePresetId}
      >
        {panelSections.map(renderContentSection)}
      </div>
    );
  }

  return (
    <div
      className={`merged-preview themed-document ${className}`.trim()}
      id={rootId}
      data-export-theme-root="true"
      data-export-style-id={styleId}
      data-image-preset-id={normalizedImagePresetId}
    >
      {panelSections.map(renderContentSection)}
    </div>
  );
}

export default MergedPreview;
