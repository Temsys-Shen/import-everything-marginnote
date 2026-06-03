import MNBridge from "../lib/mnBridge";

const COMMANDS = {
  GET_CONTEXT: "getMindmapImportContext",
  START_IMPORT: "startMindmapImport",
  GET_IMPORT_PROGRESS: "getMindmapImportProgress",
  GET_IMPORT_RESULT: "getMindmapImportResult",
  IMPORT_TREE: "importMindmapTree",
};

function ensureBridgeOk(response, commandName) {
  if (!response || response.ok !== true) {
    throw new Error(response && response.message ? response.message : `${commandName} failed`);
  }
  return response.data;
}

export async function getMindmapImportContext() {
  const response = await MNBridge.send(COMMANDS.GET_CONTEXT, {});
  return ensureBridgeOk(response, COMMANDS.GET_CONTEXT);
}

function stripMindmapNodeComments(node) {
  if (!node || typeof node !== "object") {
    return node;
  }

  return {
    ...node,
    comment: "",
    children: Array.isArray(node.children)
      ? node.children.map((child) => stripMindmapNodeComments(child))
      : [],
  };
}

function shouldStripMarkdownComments(tree, options) {
  return tree
    && tree.sourceType === "markdown"
    && options
    && options.includeMarkdownContent === false;
}

export function buildImportPayloadTree(tree, selectedSheetIds, options = {}) {
  if (!tree || typeof tree !== "object") {
    return tree;
  }

  const stripMarkdownComments = shouldStripMarkdownComments(tree, options);
  const normalizedSelectedSheetIds = Array.isArray(selectedSheetIds)
    ? selectedSheetIds.map((sheetId) => String(sheetId))
    : null;
  const filteredSheets = Array.isArray(tree.sheets)
    ? normalizedSelectedSheetIds
      ? tree.sheets.filter((sheet) => sheet && normalizedSelectedSheetIds.includes(String(sheet.id || "")))
      : tree.sheets
    : [];
  const payloadSheets = stripMarkdownComments
    ? filteredSheets.map((sheet) => ({
      ...sheet,
      root: stripMindmapNodeComments(sheet && sheet.root ? sheet.root : null),
    }))
    : filteredSheets;
  const payloadRoots = payloadSheets.length > 0
    ? payloadSheets.map((sheet) => (sheet && sheet.root ? sheet.root : null)).filter(Boolean)
    : Array.isArray(tree.roots)
      ? stripMarkdownComments
        ? tree.roots.map((root) => stripMindmapNodeComments(root))
        : tree.roots
      : [];

  return {
    ...tree,
    sheets: payloadSheets,
    roots: payloadRoots,
  };
}

export async function importMindmapTree(tree, selectedSheetIds, options = {}) {
  const response = await MNBridge.send(COMMANDS.IMPORT_TREE, {
    tree: buildImportPayloadTree(tree, selectedSheetIds, options),
  });
  return ensureBridgeOk(response, COMMANDS.IMPORT_TREE);
}

export async function startMindmapImport(tree, selectedSheetIds, options = {}) {
  const response = await MNBridge.send(COMMANDS.START_IMPORT, {
    tree: buildImportPayloadTree(tree, selectedSheetIds, options),
  });
  return ensureBridgeOk(response, COMMANDS.START_IMPORT);
}

export async function getMindmapImportProgress(taskId) {
  const response = await MNBridge.send(COMMANDS.GET_IMPORT_PROGRESS, {
    taskId: String(taskId || ""),
  });
  return ensureBridgeOk(response, COMMANDS.GET_IMPORT_PROGRESS);
}

export async function getMindmapImportResult(taskId) {
  const response = await MNBridge.send(COMMANDS.GET_IMPORT_RESULT, {
    taskId: String(taskId || ""),
  });
  return ensureBridgeOk(response, COMMANDS.GET_IMPORT_RESULT);
}
