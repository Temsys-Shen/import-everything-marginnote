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
    savePdfInit: wrapCommand("savePdfInit", savePdfInit),
    savePdfChunk: wrapCommand("savePdfChunk", savePdfChunk),
    savePdfFinalize: wrapCommand("savePdfFinalize", savePdfFinalize),
    savePdfAbort: wrapCommand("savePdfAbort", savePdfAbort),
  };

  return {
    commands: commands,
  };
})();
