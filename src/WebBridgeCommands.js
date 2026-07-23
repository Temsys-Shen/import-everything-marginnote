var __MN_WEB_BRIDGE_COMMANDS_MNImportEverythingAddon = (function () {
  const EXPORT_DIR_NAME = "ImportEverythingExports";
  const CAPTURE_SESSION_PREFIX = "capture_";
  const BILIBILI_IMPORT_DOCUMENT_DELAY_SECONDS = 0.25;
  const htmlCaptureSessions = {};

  function toBridgePayload(value) {
    return value === undefined ? null : value;
  }

  function responseOk(code, message, data) {
    return {
      ok: true,
      code: code,
      message: message,
      data: data === undefined ? null : data,
    };
  }

  function responseFail(code, message, data) {
    return {
      ok: false,
      code: code,
      message: message,
      data: data === undefined ? null : data,
    };
  }

  function assertBridgeResponseShape(response, commandName) {
    if (!response || typeof response !== "object") {
      throw new Error(`${commandName}: invalid response object`);
    }
    if (typeof response.ok !== "boolean") {
      throw new Error(`${commandName}: response.ok must be boolean`);
    }
    if (typeof response.code !== "string") {
      throw new Error(`${commandName}: response.code must be string`);
    }
    if (typeof response.message !== "string") {
      throw new Error(`${commandName}: response.message must be string`);
    }
  }

  function validatePayloadObject(payload, commandName) {
    if (!payload || typeof payload !== "object") {
      throw new Error(`${commandName}: payload must be an object`);
    }
  }

  function appInstance() {
    return Application.sharedInstance();
  }

  function fileManager() {
    return NSFileManager.defaultManager();
  }

  function ensureDirectory(path) {
    const fm = fileManager();
    if (fm.fileExistsAtPath(path)) {
      if (!fm.isDirectoryAtPath(path)) {
        throw new Error(`Path exists but is not a directory: ${path}`);
      }
      return;
    }

    const created = fm.createDirectoryAtPathWithIntermediateDirectoriesAttributes(path, true, null);
    if (!created) {
      throw new Error(`Failed to create directory: ${path}`);
    }
  }

  function exportDirectoryPath() {
    const path = `${appInstance().documentPath}/${EXPORT_DIR_NAME}`;
    ensureDirectory(path);
    return path;
  }

  function normalizePdfFileName(fileName) {
    const input = String(fileName || "Export.pdf").trim() || "Export.pdf";
    const sanitized = input.replace(/[\\/:*?"<>|]/g, "_");
    if (sanitized.toLowerCase().endsWith(".pdf")) {
      return sanitized;
    }
    return `${sanitized}.pdf`;
  }

  function normalizeMnvlinkFileName(title, bvid) {
    const safeTitle = String(title || "").trim().replace(/[\\/:*?"<>|]/g, "_");
    const safeBvid = String(bvid || "").trim().replace(/[\\/:*?"<>|]/g, "_");
    const baseName = safeTitle || safeBvid;
    if (!baseName) {
      throw new Error("Mnvlink filename requires title or bvid");
    }
    if (safeTitle && safeBvid) {
      return `${safeTitle}_${safeBvid}.mnvlink`;
    }
    return `${baseName}.mnvlink`;
  }

  function uniqueTargetPath(targetDir, fileName) {
    const normalized = normalizePdfFileName(fileName);
    const extIndex = normalized.lastIndexOf(".");
    const baseName = extIndex > 0 ? normalized.slice(0, extIndex) : normalized;
    const ext = extIndex > 0 ? normalized.slice(extIndex) : "";
    let candidate = `${targetDir}/${normalized}`;
    let counter = 1;

    while (fileManager().fileExistsAtPath(candidate)) {
      candidate = `${targetDir}/${baseName}-${counter}${ext}`;
      counter += 1;
      if (counter > 10000) {
        throw new Error(`Too many duplicate filenames: ${fileName}`);
      }
    }

    return candidate;
  }

  function wrapCommand(commandName, fn) {
    return function wrapped(context, payload) {
      try {
        const result = fn(context, payload);
        assertBridgeResponseShape(result, commandName);
        return result;
      } catch (error) {
        return responseFail(`${commandName.toUpperCase()}_EXCEPTION`, `${commandName} error: ${String(error)}`);
      }
    };
  }

  function loadExportConfig(context, payload) {
    validatePayloadObject(payload, "loadExportConfig");
    const config = __MN_EXPORT_CONFIG_STORE_MNImportEverythingAddon.loadConfig(context.addon.mainPath);
    return responseOk("LOAD_EXPORT_CONFIG_OK", "Export config loaded", config);
  }

  function readStyleFile(context, payload) {
    validatePayloadObject(payload, "readStyleFile");
    const styleId = String(payload.styleId || "");
    if (!styleId) {
      throw new Error("styleId is required");
    }

    const result = __MN_EXPORT_CONFIG_STORE_MNImportEverythingAddon.readStyleFile(context.addon.mainPath, styleId);
    return responseOk("READ_STYLE_FILE_OK", "Style loaded", result);
  }

  function saveStyleFile(context, payload) {
    validatePayloadObject(payload, "saveStyleFile");
    const result = __MN_EXPORT_CONFIG_STORE_MNImportEverythingAddon.saveStyleFile(context.addon.mainPath, payload);
    return responseOk("SAVE_STYLE_FILE_OK", "Style saved", result);
  }

  function deleteStyleFile(context, payload) {
    validatePayloadObject(payload, "deleteStyleFile");
    const styleId = String(payload.styleId || "");
    if (!styleId) {
      throw new Error("styleId is required");
    }

    const result = __MN_EXPORT_CONFIG_STORE_MNImportEverythingAddon.deleteStyleFile(context.addon.mainPath, styleId);
    return responseOk("DELETE_STYLE_FILE_OK", "Style moved to trash", result);
  }

  function readFontFile(context, payload) {
    validatePayloadObject(payload, "readFontFile");
    const fontId = String(payload.fontId || "");
    if (!fontId) {
      throw new Error("fontId is required");
    }

    const result = __MN_EXPORT_CONFIG_STORE_MNImportEverythingAddon.readFontFile(context.addon.mainPath, fontId);
    return responseOk("READ_FONT_FILE_OK", "Font loaded", result);
  }

  function saveFontInit(context, payload) {
    validatePayloadObject(payload, "saveFontInit");
    const fileName = String(payload.fileName || "");
    const mimeType = String(payload.mimeType || "application/octet-stream");
    const expectedByteLength = Number(payload.expectedByteLength || 0);

    const result = __MN_BINARY_TRANSFER_STORE_MNImportEverythingAddon.createSession({
      fileName: fileName,
      mimeType: mimeType,
      expectedByteLength: expectedByteLength,
      kind: "font",
    });

    return responseOk("SAVE_FONT_INIT_OK", "Font upload session created", result);
  }

  function saveFontChunk(context, payload) {
    validatePayloadObject(payload, "saveFontChunk");
    const result = __MN_BINARY_TRANSFER_STORE_MNImportEverythingAddon.appendChunk(
      String(payload.sessionId || ""),
      payload.chunkIndex,
      payload.base64Chunk,
      payload.chunkCharLength,
      "font",
    );

    return responseOk("SAVE_FONT_CHUNK_OK", "Font chunk accepted", result);
  }

  function saveFontFinalize(context, payload) {
    validatePayloadObject(payload, "saveFontFinalize");
    const summary = __MN_BINARY_TRANSFER_STORE_MNImportEverythingAddon.completeSession(
      String(payload.sessionId || ""),
      payload.totalChunks,
      payload.expectedByteLength,
      "font",
    );

    try {
      const record = __MN_EXPORT_CONFIG_STORE_MNImportEverythingAddon.saveFontRecord(context.addon.mainPath, {
        tempPath: summary.tempPath,
        originalFileName: summary.fileName,
        family: payload.family,
        weight: payload.weight,
        style: payload.style,
      });

      __MN_BINARY_TRANSFER_STORE_MNImportEverythingAddon.destroySession(summary.sessionId, "font-finalized");
      return responseOk("SAVE_FONT_FINALIZE_OK", "Font uploaded", {
        sessionId: summary.sessionId,
        font: record.font,
        savedPath: record.path,
      });
    } catch (error) {
      try {
        __MN_BINARY_TRANSFER_STORE_MNImportEverythingAddon.destroySession(summary.sessionId, "font-finalize-error");
      } catch (cleanupError) {
        console.log(`[ImportEverything] font finalize cleanup failed: ${String(cleanupError)}`);
      }
      throw error;
    }
  }

  function saveFontAbort(context, payload) {
    validatePayloadObject(payload, "saveFontAbort");
    const sessionId = String(payload.sessionId || "");
    if (!sessionId) {
      return responseFail("INVALID_SESSION_ID", "sessionId is required");
    }

    try {
      __MN_BINARY_TRANSFER_STORE_MNImportEverythingAddon.destroySession(
        sessionId,
        `font-abort:${String(payload.reason || "unknown")}`,
      );
      return responseOk("SAVE_FONT_ABORT_OK", "Font session aborted", {
        sessionId: sessionId,
      });
    } catch (error) {
      return responseFail("SAVE_FONT_ABORT_FAILED", `saveFontAbort error: ${String(error)}`, {
        sessionId: sessionId,
      });
    }
  }

  function deleteFontFile(context, payload) {
    validatePayloadObject(payload, "deleteFontFile");
    const fontId = String(payload.fontId || "");
    if (!fontId) {
      throw new Error("fontId is required");
    }

    const result = __MN_EXPORT_CONFIG_STORE_MNImportEverythingAddon.deleteFontFile(context.addon.mainPath, fontId);
    return responseOk("DELETE_FONT_FILE_OK", "Font moved to trash", result);
  }

  function showAlertMessage(context, payload) {
    validatePayloadObject(payload, "showAlertMessage");
    const message = String(payload.message || "").trim();
    if (!message) {
      throw new Error("message is required");
    }

    appInstance().alert(message);
    return responseOk("SHOW_ALERT_MESSAGE_OK", "Alert shown", {
      message: message,
    });
  }

  function studyControllerForContext(context) {
    if (!context || !context.addon || !context.addon.window) {
      throw new Error("addon window is unavailable");
    }

    const studyController = appInstance().studyController(context.addon.window);
    if (!studyController) {
      throw new Error("studyController is unavailable");
    }
    return studyController;
  }

  function bridgedArrayLength(value, name) {
    if (!value) {
      return 0;
    }
    if (typeof value.length === "number") {
      return value.length;
    }
    if (typeof value.count === "number") {
      return value.count;
    }
    throw new Error(`${name} does not expose length`);
  }

  function bridgedArrayItem(value, index, name) {
    if (!value) {
      throw new Error(`${name} is unavailable`);
    }
    if (typeof value.objectAtIndex === "function") {
      return value.objectAtIndex(index);
    }
    if (value[index] !== undefined) {
      return value[index];
    }
    throw new Error(`${name} does not support indexed access`);
  }

  function currentMindmapImportContext(context) {
    const studyController = studyControllerForContext(context);
    const notebookController = studyController.notebookController;
    if (!notebookController) {
      throw new Error("notebookController is unavailable");
    }

    const readerController = studyController.readerController;
    const documentController = readerController ? readerController.currentDocumentController : null;
    const document = documentController ? documentController.document : null;
    if (!document) {
      throw new Error("current document is unavailable");
    }

    const notebookId = String(notebookController.notebookId || "");
    if (!notebookId) {
      throw new Error("current notebookId is unavailable");
    }

    const notebook = Database.sharedInstance().getNotebookById(notebookId);
    if (!notebook) {
      throw new Error(`notebook not found: ${notebookId}`);
    }

    const mindmapView = notebookController.mindmapView;
    const selectedViews = mindmapView ? mindmapView.selViewLst : null;
    const selectedCount = selectedViews ? bridgedArrayLength(selectedViews, "selViewLst") : 0;
    const focusNote = notebookController.focusNote || null;

    let targetKind = "notebook-root";
    let targetNote = null;

    if (selectedCount === 1) {
      const selectedView = bridgedArrayItem(selectedViews, 0, "selViewLst");
      const selectedNode = selectedView ? selectedView.note : null;
      if (!selectedNode || !selectedNode.note) {
        throw new Error("selected mindmap node is unavailable");
      }
      targetKind = "child-of-selection";
      targetNote = selectedNode.note;
    }

    return {
      studyController,
      notebookController,
      documentController,
      notebook,
      notebookId,
      document,
      focusNote,
      selectedCount,
      targetKind,
      targetNote,
    };
  }

  function getMindmapImportContext(context, payload) {
    validatePayloadObject(payload, "getMindmapImportContext");
    const current = currentMindmapImportContext(context);

    return responseOk("GET_MINDMAP_IMPORT_CONTEXT_OK", "Mindmap import context loaded", {
      notebookId: current.notebookId,
      docMd5: String(current.document.docMd5 || ""),
      focusNoteId: current.focusNote ? String(current.focusNote.noteId || "") : "",
      focusNoteTitle: current.focusNote ? String(current.focusNote.noteTitle || "") : "",
      selectedCount: current.selectedCount,
      targetKind: current.targetKind,
      targetNoteId: current.targetNote ? String(current.targetNote.noteId || "") : "",
      targetNoteTitle: current.targetNote ? String(current.targetNote.noteTitle || "") : "",
    });
  }

  function normalizeImportedNodeStyle(style) {
    if (!style || typeof style !== "object") {
      return {
        labels: [],
        markers: [],
        branchColor: "",
      };
    }

    const labels = Array.isArray(style.labels)
      ? style.labels.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
    const markers = Array.isArray(style.markers)
      ? style.markers.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
    const branchColor = typeof style.branchColor === "string" ? style.branchColor.trim() : "";

    return {
      labels,
      markers,
      branchColor,
    };
  }

  function normalizeImportedNode(rawNode, path) {
    if (!rawNode || typeof rawNode !== "object") {
      throw new Error(`Invalid node at ${path}`);
    }

    const text = String(rawNode.text || "").trim();
    if (!text) {
      throw new Error(`Node text is required at ${path}`);
    }

    const children = Array.isArray(rawNode.children)
      ? rawNode.children.map((child, index) => normalizeImportedNode(child, `${path}.children[${index}]`))
      : [];
    const comment = typeof rawNode.comment === "string" ? rawNode.comment.trim() : "";
    const style = normalizeImportedNodeStyle(rawNode.style);
    const image = rawNode.image && typeof rawNode.image === "object" && typeof rawNode.image.data === "string" && typeof rawNode.image.mimeType === "string"
      ? { mimeType: rawNode.image.mimeType, data: rawNode.image.data }
      : null;

    return {
      text,
      comment,
      style,
      image,
      children,
    };
  }

  function buildImportedMarkdownComment(node) {
    const sections = [];

    if (node.image && node.image.data && node.image.mimeType) {
      sections.push(`![image](data:${node.image.mimeType};base64,${node.image.data})`);
    }

    if (node.comment) {
      sections.push(node.comment);
    }

    const metadataLines = [];
    if (node.style.labels.length > 0) {
      metadataLines.push(`- 标签: ${node.style.labels.join("、")}`);
    }
    if (node.style.markers.length > 0) {
      metadataLines.push(`- 标记: ${node.style.markers.join("、")}`);
    }
    if (node.style.branchColor) {
      metadataLines.push(`- 颜色: ${node.style.branchColor}`);
    }

    if (metadataLines.length > 0) {
      sections.push(["导入元数据", ...metadataLines].join("\n"));
    }

    return sections.join("\n\n").trim();
  }

  function normalizeImportedSheets(tree) {
    const sourceSheets = Array.isArray(tree.sheets)
      ? tree.sheets
      : Array.isArray(tree.roots)
        ? tree.roots.map(function (root, index) {
          return {
            title: root && root.text ? root.text : `Sheet ${index + 1}`,
            root: root,
          };
        })
        : [];

    const sheets = sourceSheets
      .map(function (sheet, index) {
        if (!sheet || typeof sheet !== "object") {
          throw new Error(`Invalid sheet at tree.sheets[${index}]`);
        }

        if (!sheet.root || typeof sheet.root !== "object") {
          throw new Error(`Invalid root at tree.sheets[${index}]`);
        }

        return {
          sheetIndex: index,
          title: String(sheet.title || `Sheet ${index + 1}`).trim() || `Sheet ${index + 1}`,
          root: normalizeImportedNode(sheet.root, `tree.sheets[${index}].root`),
        };
      })
      .filter(function (sheet) {
        return !!sheet.root;
      });

    if (sheets.length === 0) {
      throw new Error("tree must contain at least one root node");
    }

    return sheets;
  }

  function countImportedNodes(node) {
    if (!node) {
      return 0;
    }

    return 1 + node.children.reduce(function (sum, child) {
      return sum + countImportedNodes(child);
    }, 0);
  }

  function flattenImportedSheetNodes(sheet, rootParentNote, flattened, parentPlanIndex) {
    const planIndex = flattened.length;
    flattened.push({
      index: planIndex,
      node: sheet.root,
      parentPlanIndex: parentPlanIndex,
      rootParentNote: rootParentNote,
      sheetIndex: sheet.sheetIndex,
      sheetTitle: sheet.title,
      isLastInSheet: false,
    });

    sheet.root.children.forEach(function (child) {
      flattenImportedChildNode(child, sheet, flattened, planIndex);
    });

    flattened[flattened.length - 1].isLastInSheet = true;
  }

  function flattenImportedChildNode(node, sheet, flattened, parentPlanIndex) {
    const planIndex = flattened.length;
    flattened.push({
      index: planIndex,
      node: node,
      parentPlanIndex: parentPlanIndex,
      rootParentNote: null,
      sheetIndex: sheet.sheetIndex,
      sheetTitle: sheet.title,
      isLastInSheet: false,
    });

    node.children.forEach(function (child) {
      flattenImportedChildNode(child, sheet, flattened, planIndex);
    });
  }

  function createImportedMindmapNote(node, notebook, document, parentNote) {
    const note = Note.createWithTitleNotebookDocument(node.text, notebook, document);
    if (!note) {
      throw new Error(`Failed to create note for node: ${node.text}`);
    }

    if (parentNote) {
      parentNote.addChild(note);
    }

    const markdownComment = buildImportedMarkdownComment(node);
    if (markdownComment) {
      note.appendMarkdownComment(markdownComment);
    }

    if (node.image) {
      try {
        note.processMarkdownBase64Images();
      } catch (error) {
        console.log(`[ImportEverything] processMarkdownBase64Images failed: ${String(error)}`);
      }
    }

    return note;
  }

  function createImportedMindmapNoteTree(node, notebook, document, parentNote, createdNotes) {
    const note = createImportedMindmapNote(node, notebook, document, parentNote);
    createdNotes.push(note);
    node.children.forEach((child) => {
      createImportedMindmapNoteTree(child, notebook, document, note, createdNotes);
    });

    return note;
  }

  function buildMindmapImportResult(current, createdNotes, createdRootNotes) {
    return {
      targetKind: current.targetKind,
      selectedCount: current.selectedCount,
      createdCount: createdNotes.length,
      createdRootIds: createdRootNotes.map((note) => String(note.noteId || "")),
    };
  }

  function buildMindmapImportPlan(current, tree) {
    const sheets = normalizeImportedSheets(tree);
    const totalNodes = sheets.reduce(function (sum, sheet) {
      return sum + countImportedNodes(sheet.root);
    }, 0);
    const flattened = [];

    sheets.forEach(function (sheet) {
      flattenImportedSheetNodes(sheet, current.targetNote, flattened, null);
    });

    return {
      sheets: sheets,
      flattened: flattened,
      totalNodes: totalNodes,
    };
  }

  function processMindmapImportBatch(task, importContext, batchSize) {
    const limit = Number(batchSize || 25);
    let processed = 0;

    while (processed < limit && importContext.nextPlanIndex < importContext.flattened.length) {
      const planItem = importContext.flattened[importContext.nextPlanIndex];
      const parentNote = planItem.parentPlanIndex === null
        ? planItem.rootParentNote
        : importContext.createdNotesByPlanIndex[planItem.parentPlanIndex];

      if (planItem.parentPlanIndex !== null && !parentNote) {
        throw new Error(`Missing parent note for plan item ${planItem.index}`);
      }

      const createdNote = createImportedMindmapNote(
        planItem.node,
        importContext.current.notebook,
        importContext.current.document,
        parentNote,
      );

      importContext.createdNotes.push(createdNote);
      importContext.createdNotesByPlanIndex[planItem.index] = createdNote;

      if (planItem.parentPlanIndex === null) {
        importContext.createdRootNotes.push(createdNote);
      }

      importContext.nextPlanIndex += 1;
      processed += 1;

      const nextCurrent = importContext.nextPlanIndex;
      const finishedSheetCount = planItem.isLastInSheet
        ? planItem.sheetIndex + 1
        : importContext.finishedSheetCount;
      importContext.finishedSheetCount = finishedSheetCount;

      __MN_MINDMAP_IMPORT_TASK_STORE_MNImportEverythingAddon.updateTask(task.taskId, {
        current: nextCurrent,
        createdCount: importContext.createdNotes.length,
        finishedSheetCount: finishedSheetCount,
        currentSheetTitle: planItem.sheetTitle,
        currentSheetIndex: planItem.sheetIndex,
        message: `正在导入脑图 ${nextCurrent}/${importContext.totalNodes}`,
      });
    }

    if (importContext.nextPlanIndex >= importContext.flattened.length) {
      appInstance().refreshAfterDBChanged(importContext.current.notebookId);
      if (importContext.createdRootNotes.length > 0) {
        importContext.current.studyController.focusNoteInMindMapById(importContext.createdRootNotes[0].noteId);
      }

      const successMessage = `脑图导入完成，共创建${importContext.createdNotes.length}个节点`;
      const result = buildMindmapImportResult(
        importContext.current,
        importContext.createdNotes,
        importContext.createdRootNotes,
      );
      __MN_MINDMAP_IMPORT_TASK_STORE_MNImportEverythingAddon.completeTask(task.taskId, result, successMessage);
    }
  }

  function startMindmapImport(context, payload) {
    validatePayloadObject(payload, "startMindmapImport");
    if (!payload.tree || typeof payload.tree !== "object") {
      throw new Error("tree is required");
    }

    const current = currentMindmapImportContext(context);
    const plan = buildMindmapImportPlan(current, payload.tree);
    const firstSheet = plan.sheets[0] || null;
    const taskInfo = __MN_MINDMAP_IMPORT_TASK_STORE_MNImportEverythingAddon.createTask({
      current: 0,
      total: plan.totalNodes,
      message: `正在导入脑图 0/${plan.totalNodes}`,
      currentSheetTitle: firstSheet ? firstSheet.title : "",
      currentSheetIndex: firstSheet ? firstSheet.sheetIndex : -1,
    });
    const batchSize = 25;

    const importContext = {
      current: current,
      sheets: plan.sheets,
      flattened: plan.flattened,
      totalNodes: plan.totalNodes,
      nextPlanIndex: 0,
      finishedSheetCount: 0,
      createdNotes: [],
      createdRootNotes: [],
      createdNotesByPlanIndex: {},
    };

    __MN_MINDMAP_IMPORT_TASK_STORE_MNImportEverythingAddon.startTask(taskInfo.taskId, function (task) {
      processMindmapImportBatch(task, importContext, batchSize);
    });

    return responseOk("START_MINDMAP_IMPORT_OK", "Mindmap import task started", {
      taskId: taskInfo.taskId,
      phase: taskInfo.phase,
      current: taskInfo.current,
      total: taskInfo.total,
      message: taskInfo.message,
      createdCount: taskInfo.createdCount,
      finishedSheetCount: taskInfo.finishedSheetCount,
      currentSheetTitle: taskInfo.currentSheetTitle,
      currentSheetIndex: taskInfo.currentSheetIndex,
      resultReady: taskInfo.resultReady,
    });
  }

  function getMindmapImportProgress(context, payload) {
    validatePayloadObject(payload, "getMindmapImportProgress");
    const taskId = String(payload.taskId || "");
    if (!taskId) {
      throw new Error("taskId is required");
    }

    const task = __MN_MINDMAP_IMPORT_TASK_STORE_MNImportEverythingAddon.getTaskProgress(taskId);
    return responseOk("GET_MINDMAP_IMPORT_PROGRESS_OK", "Mindmap import progress loaded", task);
  }

  function getMindmapImportResult(context, payload) {
    validatePayloadObject(payload, "getMindmapImportResult");
    const taskId = String(payload.taskId || "");
    if (!taskId) {
      throw new Error("taskId is required");
    }

    const result = __MN_MINDMAP_IMPORT_TASK_STORE_MNImportEverythingAddon.getTaskResult(taskId);
    return responseOk("GET_MINDMAP_IMPORT_RESULT_OK", "Mindmap import result loaded", result);
  }

  function importMindmapTree(context, payload) {
    validatePayloadObject(payload, "importMindmapTree");
    if (!payload.tree || typeof payload.tree !== "object") {
      throw new Error("tree is required");
    }

    const current = currentMindmapImportContext(context);
    const sheets = normalizeImportedSheets(payload.tree);
    const createdNotes = [];
    const createdRootNotes = [];

    sheets.forEach((sheet) => {
      const rootNote = createImportedMindmapNoteTree(
        sheet.root,
        current.notebook,
        current.document,
        current.targetNote,
        createdNotes,
      );
      createdRootNotes.push(rootNote);
    });

    appInstance().refreshAfterDBChanged(current.notebookId);
    if (createdRootNotes.length > 0) {
      current.studyController.focusNoteInMindMapById(createdRootNotes[0].noteId);
    }

    return responseOk("IMPORT_MINDMAP_TREE_OK", "Mindmap imported", buildMindmapImportResult(current, createdNotes, createdRootNotes));
  }

  function savePdfInit(context, payload) {
    validatePayloadObject(payload, "savePdfInit");
    const fileName = normalizePdfFileName(payload.fileName);
    const mimeType = String(payload.mimeType || "application/pdf");
    if (mimeType !== "application/pdf") {
      return responseFail("INVALID_MIME_TYPE", `Unsupported mimeType: ${mimeType}`);
    }

    const result = __MN_BINARY_TRANSFER_STORE_MNImportEverythingAddon.createSession({
      fileName: fileName,
      mimeType: mimeType,
      expectedByteLength: Number(payload.expectedByteLength || 0),
      kind: "pdf",
    });

    return responseOk("SAVE_PDF_INIT_OK", "PDF session created", {
      sessionId: result.sessionId,
      maxChunkChars: result.maxChunkChars,
      fileName: fileName,
      targetDir: exportDirectoryPath(),
    });
  }

  function savePdfChunk(context, payload) {
    validatePayloadObject(payload, "savePdfChunk");
    const result = __MN_BINARY_TRANSFER_STORE_MNImportEverythingAddon.appendChunk(
      String(payload.sessionId || ""),
      payload.chunkIndex,
      payload.base64Chunk,
      payload.chunkCharLength,
      "pdf",
    );

    return responseOk("SAVE_PDF_CHUNK_OK", "PDF chunk accepted", result);
  }

  function savePdfFinalize(context, payload) {
    validatePayloadObject(payload, "savePdfFinalize");
    const summary = __MN_BINARY_TRANSFER_STORE_MNImportEverythingAddon.completeSession(
      String(payload.sessionId || ""),
      payload.totalChunks,
      payload.expectedByteLength,
      "pdf",
    );

    try {
      const targetDir = exportDirectoryPath();
      const targetPath = uniqueTargetPath(targetDir, summary.fileName);
      const moved = fileManager().moveItemAtPathToPath(summary.tempPath, targetPath);
      if (!moved) {
        throw new Error(`Failed to move temp PDF to ${targetPath}`);
      }

      const studyController = studyControllerForContext(context);
      const notebookId = String(studyController.notebookController ? studyController.notebookController.notebookId : "");
      if (!notebookId) {
        throw new Error("current notebookId is unavailable");
      }

      const importResult = appInstance().importDocument(targetPath);
      const importedDocMd5 = String(importResult || "");
      if (!importedDocMd5) {
        throw new Error("importDocument returned an empty document id");
      }

      studyController.openNotebookAndDocument(notebookId, importedDocMd5);
      __MN_BINARY_TRANSFER_STORE_MNImportEverythingAddon.destroySession(summary.sessionId, "pdf-finalized");

      return responseOk("SAVE_PDF_FINALIZE_OK", "File saved and imported", {
        sessionId: summary.sessionId,
        savedPath: targetPath,
        importResult: toBridgePayload(importResult),
        openedNotebookId: notebookId,
        openedDocMd5: importedDocMd5,
        expectedByteLength: summary.expectedByteLength,
        finalLength: summary.finalLength,
      });
    } catch (error) {
      try {
        __MN_BINARY_TRANSFER_STORE_MNImportEverythingAddon.destroySession(summary.sessionId, "pdf-finalize-error");
      } catch (cleanupError) {
        console.log(`[ImportEverything] pdf finalize cleanup failed: ${String(cleanupError)}`);
      }
      throw error;
    }
  }

  function savePdfAbort(context, payload) {
    validatePayloadObject(payload, "savePdfAbort");
    const sessionId = String(payload.sessionId || "");
    if (!sessionId) {
      return responseFail("INVALID_SESSION_ID", "sessionId is required");
    }

    try {
      __MN_BINARY_TRANSFER_STORE_MNImportEverythingAddon.destroySession(
        sessionId,
        `pdf-abort:${String(payload.reason || "unknown")}`,
      );
      return responseOk("SAVE_PDF_ABORT_OK", "PDF session aborted", {
        sessionId: sessionId,
      });
    } catch (error) {
      return responseFail("SAVE_PDF_ABORT_FAILED", `savePdfAbort error: ${String(error)}`, {
        sessionId: sessionId,
      });
    }
  }

  function ping(context, payload) {
    return responseOk("PING_OK", "Ping received", {
      now: new Date().toISOString(),
      source: "mn-addon",
      payload: toBridgePayload(payload),
      addon: context.addon && context.addon.window ? "available" : "unavailable",
    });
  }

  function echo(context, payload) {
    return responseOk("ECHO_OK", "Echo received", {
      echoed: toBridgePayload(payload),
    });
  }

  function closePanel(context, payload) {
    context.closePanel(context.controller);
    return responseOk("CLOSE_PANEL_OK", "Panel closed", {
      closed: true,
      payload: toBridgePayload(payload),
    });
  }

  function closePanelAndShowAlert(context, payload) {
    validatePayloadObject(payload, "closePanelAndShowAlert");
    const message = String(payload.message || "").trim();
    if (!message) {
      throw new Error("message is required");
    }

    context.closePanel(context.controller);
    appInstance().alert(message);
    return responseOk("CLOSE_PANEL_AND_SHOW_ALERT_OK", "Panel closed and alert shown", {
      closed: true,
      message: message,
    });
  }

  function captureHtmlAsPdf(context, payload) {
    const html = String(payload && payload.html || "");
    if (!html) {
      return responseFail("CAPTURE_HTML_EMPTY", "HTML is required");
    }

    const parentView = context.controller.view;
    const panelWebView = context.controller.webView;
    const pageWidth = Number(payload.pageWidth || 794);
    const pageHeight = Number(payload.pageHeight || 1123);
    const sessionId = `${CAPTURE_SESSION_PREFIX}${Date.now()}_${Math.floor(Math.random() * 1000000)}`;

    const tempWebView = new UIWebView({
      x: -5000, y: 0,
      width: pageWidth,
      height: pageHeight,
    });
    tempWebView.backgroundColor = UIColor.whiteColor();
    tempWebView.scalesPageToFit = false;
    tempWebView.hidden = false;
    parentView.addSubview(tempWebView);

    function bridgeProgress(msg) {
      try {
        panelWebView.evaluateJavaScript(
          "window.__bridgeProgress && __bridgeProgress(" + JSON.stringify(msg) + ")",
          null
        );
      } catch (e) {}
    }

    return new Promise(function (resolve) {
      var done = false;

      var timeoutTimer = NSTimer.scheduledTimerWithTimeInterval(120, false, function () {
        if (done) return;
        done = true;
        if (tempWebView.superview) tempWebView.removeFromSuperview();
        resolve(responseFail("CAPTURE_TIMEOUT", "Snapshot timed out after 120s"));
      });

      function finish(errorMsg, result) {
        if (done) return;
        done = true;
        timeoutTimer.invalidate();
        if (errorMsg && tempWebView.superview) tempWebView.removeFromSuperview();
        if (errorMsg) {
          resolve(responseFail("CAPTURE_FAILED", errorMsg));
        } else {
          resolve(result);
        }
      }

      function prepareCaptureSession(totalHeight) {
        const pageCount = Math.max(1, Math.ceil(totalHeight / pageHeight));
        htmlCaptureSessions[sessionId] = {
          webView: tempWebView,
          pageWidth: pageWidth,
          pageHeight: pageHeight,
          totalHeight: totalHeight,
          pageCount: pageCount,
        };
        finish(null, responseOk("CAPTURE_READY", "Snapshot session ready", {
          sessionId: sessionId,
          width: pageWidth,
          height: totalHeight,
          pageWidth: pageWidth,
          pageHeight: pageHeight,
          pageCount: pageCount,
        }));
      }

      function checkImagesAndSnap() {
        if (done) return;
        tempWebView.evaluateJavaScript(
          "(function(){var imgs=document.images;var total=imgs.length;var loaded=0;for(var i=0;i<total;i++){if(imgs[i].complete)loaded++;}return JSON.stringify({ready:loaded===total,total:total,loaded:loaded});})()",
          function (raw) {
            if (done) return;
            try {
              var info = JSON.parse(raw);
              console.log("[ImportEverything] image check: " + info.loaded + "/" + info.total + " ready=" + info.ready);
              if (!info.ready && info.total > 0) {
                bridgeProgress("正在加载图片 " + info.loaded + "/" + info.total);
                NSTimer.scheduledTimerWithTimeInterval(0.3, false, checkImagesAndSnap);
                return;
              }
            } catch (e) {
              console.log("[ImportEverything] image check error: " + String(e));
            }

            bridgeProgress("正在调整页面布局");
            tempWebView.evaluateJavaScript(
              "Math.max(document.body.scrollHeight||0,document.documentElement.scrollHeight||0)||0",
              function (hResult) {
                if (done) return;
                var sh = Number(hResult) || 0;
                console.log("[ImportEverything] scrollHeight=" + sh);
                const totalHeight = Math.max(pageHeight, Math.ceil(sh + 40));
                tempWebView.frame = { x: -5000, y: 0, width: pageWidth, height: pageHeight };
                NSTimer.scheduledTimerWithTimeInterval(0.15, false, function () {
                  if (done) return;
                  prepareCaptureSession(totalHeight);
                });
              }
            );
          }
        );
      }

      function pollLoad() {
        NSTimer.scheduledTimerWithTimeInterval(0.3, true, function (t) {
          if (done) { t.invalidate(); return; }
          try {
            if (tempWebView.loading) return;
          } catch (e) { return; }
          t.invalidate();
          bridgeProgress("正在加载图片");
          NSTimer.scheduledTimerWithTimeInterval(0.3, false, checkImagesAndSnap);
        });
      }

      tempWebView.loadHTMLStringBaseURL(html, NSURL.URLWithString("about:blank"));
      NSTimer.scheduledTimerWithTimeInterval(0.5, false, pollLoad);
    });
  }

  function captureHtmlPdfPage(context, payload) {
    const sessionId = String(payload && payload.sessionId || "");
    const pageIndex = Number(payload && payload.pageIndex);
    const jpegQuality = Math.max(0.1, Math.min(1, Number(payload && payload.jpegQuality || 0.85)));
    const session = htmlCaptureSessions[sessionId];

    if (!session) {
      return responseFail("CAPTURE_SESSION_NOT_FOUND", "Capture session not found: " + sessionId);
    }
    if (!Number.isFinite(pageIndex) || pageIndex < 0 || pageIndex >= session.pageCount) {
      return responseFail("CAPTURE_PAGE_INDEX_INVALID", "Invalid capture page index: " + pageIndex);
    }

    return new Promise(function (resolve) {
      const offsetY = Math.floor(pageIndex * session.pageHeight);
      const webView = session.webView;

      webView.evaluateJavaScript(
        "window.scrollTo(0," + offsetY + ");document.documentElement.scrollTop=" + offsetY + ";document.body.scrollTop=" + offsetY,
        function () {
          NSTimer.scheduledTimerWithTimeInterval(0.08, false, function () {
            webView.takeSnapshotWithWidth(session.pageWidth, function (image) {
              if (!image) {
                resolve(responseFail("CAPTURE_PAGE_EMPTY", "takeSnapshot returned null at page " + pageIndex));
                return;
              }

              const w = image.size ? image.size.width : 0;
              const h = image.size ? image.size.height : 0;
              console.log("[ImportEverything] snapshot page " + (pageIndex + 1) + "/" + session.pageCount + " size: " + w + "x" + h);

              if (w <= 0 || h <= 0) {
                resolve(responseFail("CAPTURE_PAGE_ZERO_DIMENSION", "Snapshot has zero dimension at page " + pageIndex));
                return;
              }

              let nsData = image.jpegData(jpegQuality);
              if (!nsData || nsData.length() === 0) {
                nsData = image.pngData();
              }
              if (!nsData || nsData.length() === 0) {
                resolve(responseFail("CAPTURE_PAGE_ENCODE_EMPTY", "jpegData and pngData both returned empty at page " + pageIndex));
                return;
              }

              resolve(responseOk("CAPTURE_PAGE_OK", "Snapshot page captured", {
                data: nsData.base64Encoding(),
                width: w,
                height: h,
                offsetY: offsetY,
                pageIndex: pageIndex,
                pageCount: session.pageCount,
              }));
            });
          });
        }
      );
    });
  }

  function finishCaptureHtmlAsPdf(context, payload) {
    const sessionId = String(payload && payload.sessionId || "");
    const session = htmlCaptureSessions[sessionId];

    if (!session) {
      return responseFail("CAPTURE_SESSION_NOT_FOUND", "Capture session not found: " + sessionId);
    }

    if (session.webView && session.webView.superview) {
      session.webView.removeFromSuperview();
    }
    delete htmlCaptureSessions[sessionId];

    return responseOk("CAPTURE_FINISH_OK", "Snapshot session finished", {
      sessionId: sessionId,
    });
  }

  function fetchImageForExport(context, payload) {
    const url = String(payload && payload.url || "").trim();
    if (!url) {
      return responseFail("FETCH_IMAGE_INVALID_URL", "URL is required");
    }

    const request = NSMutableURLRequest.requestWithURL(NSURL.URLWithString(url));
    request.setTimeoutInterval(15);

    return new Promise(function (resolve) {
      NSURLConnection.sendAsynchronousRequestQueueCompletionHandler(
        request,
        NSOperationQueue.mainQueue(),
        function (response, data, error) {
          if (error) {
            resolve(responseFail("FETCH_IMAGE_ERROR", String(error.localizedDescription)));
            return;
          }
          if (!data || data.length() === 0) {
            resolve(responseFail("FETCH_IMAGE_EMPTY", "No data received"));
            return;
          }

          const httpResponse = response;
          const statusCode = httpResponse ? httpResponse.statusCode() : 0;
          if (statusCode !== 200) {
            resolve(responseFail("FETCH_IMAGE_STATUS", "HTTP " + statusCode));
            return;
          }

          const base64Data = data.base64Encoding();
          const headers = httpResponse ? httpResponse.allHeaderFields() : null;
          const mimeType = (headers && headers["Content-Type"]) || "image/png";

          resolve(responseOk("FETCH_IMAGE_OK", "Image fetched", {
            data: base64Data,
            mimeType: mimeType,
          }));
        }
      );
    });
  }

  function isBridgeNil(obj) {
    return obj === null || typeof obj === "undefined" || obj instanceof NSNull;
  }

  function bilibiliApiProxy(context, payload) {
    if (!payload || typeof payload !== "object") {
      return responseFail("BILI_API_INVALID_PAYLOAD", "payload must be an object");
    }
    const url = String(payload.url || "").trim();
    if (!url) {
      return responseFail("BILI_API_INVALID_URL", "URL is required");
    }

    var nsUrl = NSURL.URLWithString(url);
    var request = NSMutableURLRequest.requestWithURL(nsUrl);
    request.setTimeoutInterval(20);
    request.setValueForHTTPHeaderField("https://www.bilibili.com", "Referer");
    request.setValueForHTTPHeaderField("Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)", "User-Agent");

    return new Promise(function (resolve) {
      NSURLConnection.sendAsynchronousRequestQueueCompletionHandler(
        request,
        NSOperationQueue.mainQueue(),
        function (response, data, error) {
          if (!isBridgeNil(error)) {
            var errMsg = "";
            try {
              if (!isBridgeNil(error.localizedDescription)) errMsg = String(error.localizedDescription);
              else if (!isBridgeNil(error.code)) errMsg = "code " + String(error.code);
              var domain = "";
              var code = "";
              if (!isBridgeNil(error.domain)) domain = String(error.domain);
              if (!isBridgeNil(error.code)) code = String(error.code);
              errMsg = errMsg + " (" + domain + " " + code + ")";
            } catch (e2) {}
            resolve(responseFail("BILI_API_ERROR", errMsg));
            return;
          }
          if (isBridgeNil(data) || data.length() === 0) {
            resolve(responseFail("BILI_API_EMPTY", "No data received"));
            return;
          }

          var httpResponse = response;
          var statusCode = httpResponse ? httpResponse.statusCode() : 0;

          // Send body as base64 to avoid JS string escaping issues
          var bodyB64 = data.base64Encoding();

          resolve(responseOk("BILI_API_OK", "API fetched", {
            statusCode: statusCode,
            bodyB64: bodyB64,
          }));
        }
      );
    });
  }

  function importBilibiliVideos(context, payload) {
    validatePayloadObject(payload, "importBilibiliVideos");
    const videos = payload.videos;
    if (!Array.isArray(videos) || videos.length === 0) {
      return responseFail("BILI_IMPORT_NO_VIDEOS", "videos array is required");
    }

    var panelWebView = null;
    try {
      panelWebView = context.controller.webView;
    } catch (_) {}

    function sendProgress(current, total) {
      if (!panelWebView) return;
      try {
        panelWebView.evaluateJavaScript(
          'window.__bilibiliProgress && window.__bilibiliProgress(' + JSON.stringify({ current: current, total: total }) + ')',
          null
        );
      } catch (_) {}
    }

    const biliDir = exportDirectoryPath() + "/BilibiliVideos";
    ensureDirectory(biliDir);
    const fm = fileManager();

    var imported = 0;
    var errors = [];
    var opened = 0;
    var openQueue = [];

    for (var i = 0; i < videos.length; i++) {
      var video = videos[i];
      var bvid = String(video.bvid || "").trim();
      var title = String(video.title || bvid).trim();
      var duration = video.duration ? String(video.duration) : "";
      var thumbnail = video.thumbnail ? String(video.thumbnail) : "";
      var page = video.page ? String(video.page) : "1";
      var cid = video.cid ? String(video.cid) : null;

      if (!bvid) {
        errors.push({ bvid: bvid, title: title, error: "Missing bvid" });
        sendProgress(i + 1, videos.length);
        continue;
      }

      var mnvlinkFileName = normalizeMnvlinkFileName(title, bvid);
      var mnvlinkPath = biliDir + "/" + mnvlinkFileName;

      try {
        if (!fm.fileExistsAtPath(mnvlinkPath)) {
          var playerUrl = "https://player.bilibili.com/player.html?bvid=" + bvid + "&page=" + page + "&danmaku=0";
          if (cid) {
            playerUrl += "&cid=" + cid;
          }

          var mnvlinkContent = JSON.stringify({
            title: title,
            url: playerUrl,
            duration: duration,
            thumbnail: thumbnail,
          });

          var nsData = NSData.dataWithStringEncoding(mnvlinkContent, 4);
          if (!nsData) {
            errors.push({ bvid: bvid, title: title, error: "Failed to encode .mnvlink content" });
            sendProgress(i + 1, videos.length);
            continue;
          }
          var writeOk = nsData.writeToFileAtomically(mnvlinkPath, true);
          if (!writeOk) {
            errors.push({ bvid: bvid, title: title, error: "Failed to write .mnvlink file" });
            sendProgress(i + 1, videos.length);
            continue;
          }
        }

        var docMd5 = appInstance().importDocument(mnvlinkPath);
        if (docMd5) {
          imported++;
          openQueue.push({ bvid: bvid, title: title, docMd5: String(docMd5) });
        } else {
          errors.push({ bvid: bvid, title: title, error: "importDocument returned empty" });
        }
      } catch (e) {
        errors.push({ bvid: bvid, title: title, error: String(e) });
      }

      sendProgress(i + 1, videos.length);
    }

    return new Promise(function (resolve) {
      function finishImport() {
        resolve(responseOk("BILI_IMPORT_OK", "Bilibili import complete", {
          imported: imported,
          total: videos.length,
          errors: errors,
          opened: opened,
        }));
      }

      function openNext(studyController, notebookId, index) {
        if (index >= openQueue.length) {
          finishImport();
          return;
        }

        var item = openQueue[index];
        try {
          studyController.openNotebookAndDocument(notebookId, item.docMd5);
          opened++;
        } catch (e) {
          console.log("[ImportEverything] Failed to open doc: " + String(e));
        }

        if (index + 1 >= openQueue.length) {
          finishImport();
          return;
        }

        NSTimer.scheduledTimerWithTimeInterval(BILIBILI_IMPORT_DOCUMENT_DELAY_SECONDS, false, function () {
          openNext(studyController, notebookId, index + 1);
        });
      }

      try {
        var studyController = studyControllerForContext(context);
        var notebookId = String(studyController.notebookController ? studyController.notebookController.notebookId : "");
        if (!notebookId || openQueue.length === 0) {
          finishImport();
          return;
        }
        openNext(studyController, notebookId, 0);
      } catch (e) {
        console.log("[ImportEverything] Failed to open docs: " + String(e));
        finishImport();
      }
    });
  }

  const commands = {
    ping: wrapCommand("ping", ping),
    echo: wrapCommand("echo", echo),
    closePanel: wrapCommand("closePanel", closePanel),
    closePanelAndShowAlert: wrapCommand("closePanelAndShowAlert", closePanelAndShowAlert),
    loadExportConfig: wrapCommand("loadExportConfig", loadExportConfig),
    readStyleFile: wrapCommand("readStyleFile", readStyleFile),
    saveStyleFile: wrapCommand("saveStyleFile", saveStyleFile),
    deleteStyleFile: wrapCommand("deleteStyleFile", deleteStyleFile),
    readFontFile: wrapCommand("readFontFile", readFontFile),
    saveFontInit: wrapCommand("saveFontInit", saveFontInit),
    saveFontChunk: wrapCommand("saveFontChunk", saveFontChunk),
    saveFontFinalize: wrapCommand("saveFontFinalize", saveFontFinalize),
    saveFontAbort: wrapCommand("saveFontAbort", saveFontAbort),
    deleteFontFile: wrapCommand("deleteFontFile", deleteFontFile),
    showAlertMessage: wrapCommand("showAlertMessage", showAlertMessage),
    getMindmapImportContext: wrapCommand("getMindmapImportContext", getMindmapImportContext),
    startMindmapImport: wrapCommand("startMindmapImport", startMindmapImport),
    getMindmapImportProgress: wrapCommand("getMindmapImportProgress", getMindmapImportProgress),
    getMindmapImportResult: wrapCommand("getMindmapImportResult", getMindmapImportResult),
    importMindmapTree: wrapCommand("importMindmapTree", importMindmapTree),
    savePdfInit: wrapCommand("savePdfInit", savePdfInit),
    savePdfChunk: wrapCommand("savePdfChunk", savePdfChunk),
    savePdfFinalize: wrapCommand("savePdfFinalize", savePdfFinalize),
    savePdfAbort: wrapCommand("savePdfAbort", savePdfAbort),
    bilibiliApiProxy: bilibiliApiProxy,
    importBilibiliVideos: importBilibiliVideos,
    fetchImageForExport: fetchImageForExport,
    captureHtmlAsPdf: captureHtmlAsPdf,
    captureHtmlPdfPage: captureHtmlPdfPage,
    finishCaptureHtmlAsPdf: wrapCommand("finishCaptureHtmlAsPdf", finishCaptureHtmlAsPdf),
  };

  return {
    commands: commands,
  };
})();
