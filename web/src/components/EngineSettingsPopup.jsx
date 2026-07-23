import { useState, useMemo } from "react";
import { getAvailableEngines, getEngine } from "../engines/engineRegistry";

function sourceTypeExtensionLabel(sourceType) {
  const map = {
    docx: ".docx",
    xlsx: ".xlsx",
    xls: ".xls",
    csv: ".csv",
    pptx: ".pptx",
    doc: ".doc",
    ppt: ".ppt",
    rtf: ".rtf",
    markdown: ".md",
    html: ".html",
    text: ".txt",
    epub: ".epub",
    image: "图片",
    code: "代码",
  };
  return map[sourceType] || sourceType;
}

function countFilesBySourceType(documents, sourceType) {
  return documents.filter((d) => d.sourceType === sourceType).length;
}

export default function EngineSettingsPopup({ documents, engineSelections, onApply, onClose }) {
  const [activeTab, setActiveTab] = useState(null);

  const tabEntries = useMemo(() => {
    const sourceTypes = [...new Set(documents.map((d) => d.sourceType))];
    const entries = [];
    for (const st of sourceTypes) {
      const engines = getAvailableEngines(st);
      if (engines.length >= 2) {
        entries.push({
          sourceType: st,
          label: sourceTypeExtensionLabel(st),
          engines,
          fileCount: countFilesBySourceType(documents, st),
        });
      }
    }
    return entries;
  }, [documents]);

  const activeEntry = useMemo(() => {
    if (!activeTab) return tabEntries[0] || null;
    return tabEntries.find((e) => e.sourceType === activeTab) || tabEntries[0] || null;
  }, [activeTab, tabEntries]);

  const currentSelectedEngineId = activeEntry
    ? (engineSelections instanceof Map
        ? engineSelections.get(activeEntry.sourceType)
        : engineSelections[activeEntry.sourceType]) || null
    : null;

  function handleSelectEngine(sourceType, engineId) {
    if (onApply) {
      onApply(sourceType, engineId);
    }
  }

  if (tabEntries.length === 0) {
    return (
      <div className="engine-popup-overlay" onClick={onClose}>
        <div className="engine-popup" onClick={(e) => e.stopPropagation()}>
          <div className="engine-popup-header">
            <h3>转换引擎设置</h3>
            <button type="button" className="button button-ghost button-small" onClick={onClose}>✕</button>
          </div>
          <div className="engine-popup-body">
            <p className="muted-text">当前文件列表中没有支持多引擎切换的格式。</p>
          </div>
          <div className="engine-popup-footer">
            <button type="button" className="button button-primary" onClick={onClose}>关闭</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="engine-popup-overlay" onClick={onClose}>
      <div className="engine-popup" onClick={(e) => e.stopPropagation()}>
        <div className="engine-popup-header">
          <h3>转换引擎设置</h3>
          <button type="button" className="button button-ghost button-small" onClick={onClose}>✕</button>
        </div>

        <div className="engine-popup-tabs">
          {tabEntries.map((entry) => (
            <button
              key={entry.sourceType}
              type="button"
              className={`engine-popup-tab ${activeEntry?.sourceType === entry.sourceType ? "engine-popup-tab-active" : ""}`}
              onClick={() => setActiveTab(entry.sourceType)}
            >
              {entry.label}
            </button>
          ))}
        </div>

        {activeEntry ? (
          <div className="engine-popup-body">
            <p className="engine-popup-section-label">
              {activeEntry.label} 转换引擎
              <span className="muted-text">（{activeEntry.fileCount}个文件）</span>
            </p>

            <div className="engine-radio-group">
              {activeEntry.engines.map((engine) => {
                const isSelected = currentSelectedEngineId === engine.engineId;
                return (
                  <label
                    key={engine.engineId}
                    className={`engine-radio-option ${isSelected ? "engine-radio-option-selected" : ""}`}
                  >
                    <input
                      type="radio"
                      name={`engine-${activeEntry.sourceType}`}
                      value={engine.engineId}
                      checked={isSelected}
                      onChange={() => handleSelectEngine(activeEntry.sourceType, engine.engineId)}
                    />
                    <div className="engine-radio-content">
                      <strong>{engine.label}</strong>
                      <span className="muted-text">{engine.description}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="engine-popup-footer">
          <button type="button" className="button button-secondary" onClick={onClose}>取消</button>
          <button
            type="button"
            className="button button-primary"
            onClick={onClose}
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
}
