export function getFileBaseName(fileName, fallbackTitle) {
  return String(fileName || "").replace(/\.[^.]+$/, "").trim() || String(fallbackTitle || "").trim();
}

export function parseXmlDocument(rawText, label) {
  const parser = new DOMParser();
  const document = parser.parseFromString(String(rawText || ""), "text/xml");
  const parserError = document.querySelector("parsererror");
  if (parserError) {
    throw new Error(`${label}解析失败: XML格式无效`);
  }
  return document;
}

export function getLocalName(element) {
  return element && element.localName
    ? String(element.localName).toLowerCase()
    : element && element.tagName
      ? String(element.tagName).split(":").pop().toLowerCase()
      : "";
}

export function getDirectChildElements(element) {
  if (!element || !element.children) {
    return [];
  }
  return Array.from(element.children);
}

export function getDirectChildElementsByName(element, names) {
  const normalizedNames = Array.isArray(names) ? names : [names];
  const expected = normalizedNames.map((name) => String(name || "").toLowerCase());
  return getDirectChildElements(element).filter((child) => expected.includes(getLocalName(child)));
}

export function getFirstDirectChildByName(element, names) {
  const children = getDirectChildElementsByName(element, names);
  return children[0] || null;
}

export function getFirstDescendantByName(element, names) {
  const normalizedNames = Array.isArray(names) ? names : [names];
  const expected = normalizedNames.map((name) => String(name || "").toLowerCase());
  const queue = getDirectChildElements(element);

  while (queue.length > 0) {
    const current = queue.shift();
    if (expected.includes(getLocalName(current))) {
      return current;
    }
    queue.push(...getDirectChildElements(current));
  }

  return null;
}

export function getTrimmedAttribute(element, names) {
  if (!element || typeof element.getAttribute !== "function") {
    return "";
  }

  const candidates = Array.isArray(names) ? names : [names];
  for (const name of candidates) {
    const value = element.getAttribute(name);
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

export function getElementText(element) {
  return element && typeof element.textContent === "string" ? element.textContent.trim() : "";
}

export function findZipEntryByBaseName(entryNames, baseName) {
  const expected = String(baseName || "").toLowerCase();
  return entryNames.find((name) => String(name || "").toLowerCase().endsWith(expected)) || "";
}
