let nextNodeCounter = 1;
let nextSheetCounter = 1;

function nextMindmapNodeId(prefix = "mindmap-node") {
  const id = `${prefix}-${nextNodeCounter}`;
  nextNodeCounter += 1;
  return id;
}

function nextMindmapSheetId(prefix = "mindmap-sheet") {
  const id = `${prefix}-${nextSheetCounter}`;
  nextSheetCounter += 1;
  return id;
}

export function createMindmapImportNode(input = {}) {
  return {
    id: String(input.id || nextMindmapNodeId()),
    text: String(input.text || "").trim(),
    children: Array.isArray(input.children) ? input.children : [],
    comment: typeof input.comment === "string" ? input.comment.trim() : "",
    style: input.style && typeof input.style === "object" ? input.style : {},
    sourceMeta: input.sourceMeta && typeof input.sourceMeta === "object" ? input.sourceMeta : {},
  };
}

export function createMindmapImportSheet(input = {}) {
  return {
    id: String(input.id || nextMindmapSheetId()),
    title: String(input.title || "").trim() || "未命名Sheet",
    root: input.root && typeof input.root === "object" ? input.root : null,
    sourceMeta: input.sourceMeta && typeof input.sourceMeta === "object" ? input.sourceMeta : {},
  };
}

export function createMindmapImportTree(input = {}) {
  const providedSheets = Array.isArray(input.sheets) ? input.sheets : null;
  const fallbackRoots = Array.isArray(input.roots) ? input.roots : [];
  const sheets = providedSheets
    ? providedSheets
    : fallbackRoots.map((root, index) => createMindmapImportSheet({
      id: root && root.id ? `mindmap-sheet-${root.id}` : undefined,
      title: root && root.text ? root.text : `Sheet ${index + 1}`,
      root,
    }));

  return {
    sourceType: String(input.sourceType || "unknown"),
    title: String(input.title || "").trim() || "未命名脑图",
    sheets,
    sourceMeta: input.sourceMeta && typeof input.sourceMeta === "object" ? input.sourceMeta : {},
  };
}

export function visitMindmapNodes(node, visitor, depth = 1) {
  if (!node || typeof node !== "object") {
    return;
  }
  visitor(node, depth);
  const children = Array.isArray(node.children) ? node.children : [];
  children.forEach((child) => visitMindmapNodes(child, visitor, depth + 1));
}

export function countMindmapNodes(root) {
  let count = 0;
  visitMindmapNodes(root, () => {
    count += 1;
  });
  return count;
}

export function computeMindmapDepth(root) {
  let maxDepth = 0;
  visitMindmapNodes(root, (node, depth) => {
    if (node && node.text) {
      maxDepth = Math.max(maxDepth, depth);
    }
  });
  return maxDepth;
}

export function flattenMindmapImportRoots(tree) {
  const sheets = Array.isArray(tree && tree.sheets) ? tree.sheets : [];
  return sheets
    .map((sheet) => (sheet && sheet.root ? sheet.root : null))
    .filter(Boolean);
}

export function buildMindmapImportPreview(tree) {
  const summary = {
    nodeCount: 0,
    sheetCount: 0,
    maxDepth: 0,
  };
  const sheets = Array.isArray(tree && tree.sheets) ? tree.sheets : [];
  const sheetPreviews = sheets
    .filter((sheet) => sheet && sheet.root)
    .map((sheet) => {
      const nodeCount = countMindmapNodes(sheet.root);
      const maxDepth = computeMindmapDepth(sheet.root);
      summary.nodeCount += nodeCount;
      summary.maxDepth = Math.max(summary.maxDepth, maxDepth);
      return {
        id: sheet.id,
        title: sheet.title,
        root: sheet.root,
        nodeCount,
        maxDepth,
      };
    });

  summary.sheetCount = sheetPreviews.length;

  return {
    tree,
    sheets: sheetPreviews,
    stats: summary,
  };
}
