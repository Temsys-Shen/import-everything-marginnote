var __MN_WEB_BRIDGE_COMMANDS_MNImportEverythingAddon = (function () {
  const EXPORT_DIR_NAME = "ImportEverythingExports";

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

    return {
      text,
      comment,
      style,
      children,
    };
  }

  function buildImportedMarkdownComment(node) {
    const sections = [];
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

      const importResult = appInstance().importDocument(targetPath);
      __MN_BINARY_TRANSFER_STORE_MNImportEverythingAddon.destroySession(summary.sessionId, "pdf-finalized");

      return responseOk("SAVE_PDF_FINALIZE_OK", "File saved and imported", {
        sessionId: summary.sessionId,
        savedPath: targetPath,
        importResult: toBridgePayload(importResult),
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

  const commands = {
    ping: wrapCommand("ping", ping),
    echo: wrapCommand("echo", echo),
    closePanel: wrapCommand("closePanel", closePanel),
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
  };

  return {
    commands: commands,
  };
})();
