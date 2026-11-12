import MNBridge from "../lib/mnBridge";
import { blobToBase64, compressImage } from "../mindmap/imageUtils";

const COMMANDS = {
  GET_CONTEXT: "getMindmapImportContext",
  BEGIN_IMPORT: "beginMindmapImport",
  APPEND_IMPORT_BATCH: "appendMindmapImportBatch",
  FINISH_IMPORT: "finishMindmapImport",
  ABORT_IMPORT: "abortMindmapImport",
  GET_IMPORT_PROGRESS: "getMindmapImportProgress",
  GET_IMPORT_RESULT: "getMindmapImportResult",
  IMPORT_TREE: "importMindmapTree",
};

// bridge 的载荷会拼进 iframe 的 URL，单条消息必须保持在很小的范围内。
// 一次性发送整棵树时，531 张图片会产生约 178MB 的 base64，WebView 会直接卡死。
const MAX_BATCH_CHARS = 200_000;
const MAX_BATCH_ITEMS = 40;
const BRIDGE_TIMEOUT_MS = 60_000;

function withBridgeTimeout(promise, commandName) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${commandName} 超时`));
    }, BRIDGE_TIMEOUT_MS);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

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
      copy.image = { mimeType: image.mimeType, blob: image.blob };
      pendingImages.push(copy.image);
    } else {
      copy.image = null;
    }
  }

  copy.children = Array.isArray(node.children)
    ? node.children.map((child) => cloneNodeForPayload(child, pendingImages))
    : [];

  return copy;
}

export function buildMindmapImportPlan(tree, selectedSheetIds, options = {}) {
  if (!tree || typeof tree !== "object") {
    return {
      payloadTree: tree,
      sheets: [],
      items: [],
      imageTotal: 0,
    };
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

  const items = [];
  payloadSheets.forEach((sheet, sheetIndex) => {
    const startIndex = items.length;
    appendSheetItems(sheet && sheet.root ? sheet.root : null, sheetIndex, sheet, items, null);
    if (items.length > startIndex) {
      items[items.length - 1].isLastInSheet = true;
    }
  });

  return {
    payloadTree: {
      ...tree,
      sheets: payloadSheets,
      roots: payloadRoots,
    },
    sheets: payloadSheets,
    items,
    imageTotal: pendingImages.length,
  };
}

function appendSheetItems(node, sheetIndex, sheet, items, parentIndex) {
  if (!node || typeof node !== "object") {
    return;
  }

  const index = items.length;
  items.push({
    index,
    parentIndex,
    node,
    sheetIndex,
    sheetTitle: sheet && sheet.title ? sheet.title : "",
    isLastInSheet: false,
  });

  const children = Array.isArray(node.children) ? node.children : [];
  children.forEach((child) => appendSheetItems(child, sheetIndex, sheet, items, index));
}

async function materializePlanItemImage(item) {
  const image = item.node.image;
  if (!image || typeof image !== "object" || typeof image.mimeType !== "string") {
    item.node.image = null;
    return false;
  }

  if (typeof image.data === "string") {
    item.node.image = { mimeType: image.mimeType, data: image.data };
    return true;
  }

  if (image.blob && typeof image.blob === "object") {
    // 导入前统一压到适合卡片显示的尺寸，单张体积直接决定 bridge 与建卡的耗时。
    let compressed = image.blob;
    try {
      compressed = await compressImage(image.blob);
    } catch (error) {
      console.log(`[ImportEverything] mindmap image compress failed: ${String(error)}`);
    }
    item.node.image = {
      mimeType: compressed.type || image.mimeType,
      data: await blobToBase64(compressed),
    };
    return true;
  }

  item.node.image = null;
  return false;
}

function buildPlanPayloadItem(item) {
  return {
    index: item.index,
    parentIndex: item.parentIndex,
    sheetIndex: item.sheetIndex,
    sheetTitle: item.sheetTitle,
    isLastInSheet: item.isLastInSheet,
    text: item.node.text,
    comment: item.node.comment,
    style: item.node.style,
    image: item.node.image,
  };
}

// 兼容旧的一次性载荷构建：仅在没有分步传输能力时使用。
export async function buildImportPayloadTree(tree, selectedSheetIds, options = {}) {
  const plan = buildMindmapImportPlan(tree, selectedSheetIds, options);
  let current = 0;

  for (const item of plan.items) {
    const hasImage = await materializePlanItemImage(item);
    if (hasImage) {
      current += 1;
      if (typeof options.onImageProgress === "function") {
        options.onImageProgress({ current, total: plan.imageTotal });
      }
    }
  }

  return plan.payloadTree;
}

export async function importMindmapTree(tree, selectedSheetIds, options = {}) {
  const response = await MNBridge.send(COMMANDS.IMPORT_TREE, {
    tree: await buildImportPayloadTree(tree, selectedSheetIds, options),
  });
  return ensureBridgeOk(response, COMMANDS.IMPORT_TREE);
}

async function waitForQueueDrain(taskId, sentNodes, targetQueued) {
  for (let attempt = 0; attempt < 600; attempt += 1) {
    const progress = await getMindmapImportProgress(taskId);
    if (progress.phase === "error") {
      throw new Error(progress.error || progress.message || "脑图导入失败");
    }
    if (progress.phase === "done") {
      return;
    }

    const created = Number(progress.current) || 0;
    if (sentNodes - created <= targetQueued) {
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 200);
    });
  }
}

export async function startMindmapImport(tree, selectedSheetIds, options = {}) {
  const plan = buildMindmapImportPlan(tree, selectedSheetIds, options);
  const firstSheet = plan.sheets[0] || null;

  const beginResponse = await withBridgeTimeout(MNBridge.send(COMMANDS.BEGIN_IMPORT, {
    totalNodes: plan.items.length,
    firstSheetTitle: firstSheet ? firstSheet.title : "",
  }), COMMANDS.BEGIN_IMPORT);
  const taskInfo = ensureBridgeOk(beginResponse, COMMANDS.BEGIN_IMPORT);
  const taskId = String(taskInfo && taskInfo.taskId ? taskInfo.taskId : "");
  if (!taskId) {
    throw new Error("Mindmap import taskId is missing");
  }

  if (typeof options.onTaskStarted === "function") {
    options.onTaskStarted(taskInfo);
  }

  let imageCurrent = 0;
  let batch = [];
  let batchChars = 0;
  let sentNodes = 0;

  async function flushBatch() {
    if (batch.length === 0) {
      return;
    }

    const batchItemCount = batch.length;
    const response = await withBridgeTimeout(MNBridge.send(COMMANDS.APPEND_IMPORT_BATCH, {
      taskId,
      items: batch,
    }), COMMANDS.APPEND_IMPORT_BATCH);
    const data = ensureBridgeOk(response, COMMANDS.APPEND_IMPORT_BATCH);
    batch = [];
    batchChars = 0;
    sentNodes += batchItemCount;

    // 建卡速度跟不上传输时降低发送节奏，避免图片堆积在插件内存里。
    if (data && Number(data.queued) > 120) {
      await waitForQueueDrain(taskId, sentNodes, 40);
    }
  }

  try {
    for (const item of plan.items) {
      const hasImage = await materializePlanItemImage(item);
      if (hasImage) {
        imageCurrent += 1;
        batchChars += item.node.image.data.length;
      }

      batch.push(buildPlanPayloadItem(item));
      // 图片已经转成 base64，节点本身不再保留大对象。
      item.node.image = null;

      if (typeof options.onImageProgress === "function" && hasImage) {
        options.onImageProgress({
          current: imageCurrent,
          total: plan.imageTotal,
        });
      }

      if (batch.length >= MAX_BATCH_ITEMS || batchChars >= MAX_BATCH_CHARS) {
        await flushBatch();
      }
    }

    await flushBatch();
    const finishResponse = await withBridgeTimeout(
      MNBridge.send(COMMANDS.FINISH_IMPORT, { taskId }),
      COMMANDS.FINISH_IMPORT,
    );
    ensureBridgeOk(finishResponse, COMMANDS.FINISH_IMPORT);
    return taskInfo;
  } catch (error) {
    try {
      await MNBridge.send(COMMANDS.ABORT_IMPORT, {
        taskId,
        message: error && error.message ? error.message : String(error),
      });
    } catch (abortError) {
      console.log(`[ImportEverything] mindmap import abort failed: ${String(abortError)}`);
    }
    throw error;
  }
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
