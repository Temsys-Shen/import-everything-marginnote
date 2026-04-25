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
}) {
  const panelSections = Array.isArray(model.contentSections)
    ? model.contentSections
    : model.printableSections.filter((section) => section.type === "section");

  const isPanel = variant === "panel";
  const sections = isPanel ? panelSections : model.printableSections;

  if (sections.length === 0) {
    return <p className="muted-text">{emptyText}</p>;
  }

  if (isPanel) {
    return (
      <div className={`merged-preview ${className}`.trim()} id={rootId}>
        {panelSections.map(renderContentSection)}
      </div>
    );
  }

  return (
    <div className={`merged-preview ${className}`.trim()} id={rootId}>
      <section className="print-block toc-page print-page-break">
        <h2>目录</h2>
        <p>生成时间:{new Date(model.generatedAt).toLocaleString()}</p>
        <ol className="toc-list">
          {model.tocEntries.map((entry) => (
            <li key={entry.id}>
              <a href={`#${entry.anchor}`}>{entry.title}</a>
              <span>{entry.sectionCount}节</span>
            </li>
          ))}
        </ol>
      </section>

      {model.printableSections.map((section) => {
        if (section.type === "cover") {
          return (
            <section key={section.id} id={section.anchor} className="print-block doc-cover print-page-break">
              <p className="doc-order">文档{section.index}/{section.total}</p>
              <h3>{section.title}</h3>
              <p>类型:{section.sourceType}</p>
            </section>
          );
        }

        return renderContentSection(section);
      })}
    </div>
  );
}

export default MergedPreview;
