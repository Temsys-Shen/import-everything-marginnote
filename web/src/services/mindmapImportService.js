import MNBridge from "../lib/mnBridge";
import { blobToBase64 } from "../mindmap/imageUtils";

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

// 解析阶段图片只存了 blob + blobUrl（预览便宜），真正发给插件前才转成 base64。
function cloneNodeForPayload(node, pendingImages) {
  if (!node || typeof node !== "object") {
    return node;
  }

  const copy = { ...node };
  const image = node.image;
  if (image && typeof image === "object" && typeof image.mimeType === "string") {
    if (typeof image.data === "string") {
      copy.image = { mimeType: image.mimeType, data: image.data };
    } else if (image.blob && typeof image.blob === "object") {
      const pending = { mimeType: image.mimeType };
      copy.image = pending;
      pendingImages.push({ target: pending, blob: image.blob });
    } else {
      copy.image = null;
    }
  }

  copy.children = Array.isArray(node.children)
    ? node.children.map((child) => cloneNodeForPayload(child, pendingImages))
    : [];

  return copy;
}

async function materializePendingImages(pendingImages, onProgress) {
  for (let index = 0; index < pendingImages.length; index += 1) {
    const { target, blob } = pendingImages[index];
    target.data = await blobToBase64(blob);
    if (typeof onProgress === "function") {
      onProgress({ current: index + 1, total: pendingImages.length });
    }
  }
}

export async function buildImportPayloadTree(tree, selectedSheetIds, options = {}) {
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
  const pendingImages = [];
  const prepareRoot = (root) => cloneNodeForPayload(
    stripMarkdownComments ? stripMindmapNodeComments(root) : root,
    pendingImages,
  );
  const payloadSheets = filteredSheets.map((sheet) => (sheet && typeof sheet === "object"
    ? { ...sheet, root: prepareRoot(sheet.root || null) }
    : sheet));
  const payloadRoots = payloadSheets.length > 0
    ? payloadSheets.map((sheet) => (sheet && sheet.root ? sheet.root : null)).filter(Boolean)
    : Array.isArray(tree.roots)
      ? tree.roots.map((root) => prepareRoot(root))
      : [];

  await materializePendingImages(pendingImages, options.onImageProgress);

  return {
    ...tree,
    sheets: payloadSheets,
    roots: payloadRoots,
  };
}

export async function importMindmapTree(tree, selectedSheetIds, options = {}) {
  const response = await MNBridge.send(COMMANDS.IMPORT_TREE, {
    tree: await buildImportPayloadTree(tree, selectedSheetIds, options),
  });
  return ensureBridgeOk(response, COMMANDS.IMPORT_TREE);
}

export async function startMindmapImport(tree, selectedSheetIds, options = {}) {
  const response = await MNBridge.send(COMMANDS.START_IMPORT, {
    tree: await buildImportPayloadTree(tree, selectedSheetIds, options),
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
