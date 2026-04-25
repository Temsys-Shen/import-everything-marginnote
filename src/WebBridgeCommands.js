var __MN_WEB_BRIDGE_COMMANDS_MNImportEverythingAddon = (function () {
  const EXPORT_DIR_NAME = "ImportEverythingExports";
  const TEMP_DIR_NAME = "ImportEverythingChunkSessions";
  const SESSION_TTL_MS = 15 * 60 * 1000;
  const MAX_CHUNK_CHARS = 16000;
  const sessionStore = {};

  function toBridgePayload(value) {
    return value === undefined ? null : value;
  }

  function nowTimestamp() {
    return Date.now();
  }

  function responseOk(code, message, data) {
    return {
      ok: true,
      code,
      message,
      data: data === undefined ? null : data,
    };
  }

  function responseFail(code, message, data) {
    return {
      ok: false,
      code,
      message,
      data: data === undefined ? null : data,
    };
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

  function tempDirectoryPath() {
    const path = `${appInstance().tempPath}/${TEMP_DIR_NAME}`;
    ensureDirectory(path);
    return path;
  }

  function resetFileAtPath(path) {
    const empty = NSData.data();
    const wrote = empty.writeToFileAtomically(path, true);
    if (!wrote) {
      throw new Error(`Failed to reset file: ${path}`);
    }
  }

  function normalizeFileName(fileName) {
    const input = String(fileName || "Export.pdf");
    const sanitized = input.replace(/[\\/:*?"<>|]/g, "_");
    if (sanitized.toLowerCase().endsWith(".pdf")) {
      return sanitized;
    }
    return `${sanitized}.pdf`;
  }

  function splitNameExt(fileName) {
    const index = fileName.lastIndexOf(".");
    if (index <= 0) {
      return {
        base: fileName,
        ext: "",
      };
    }

    return {
      base: fileName.slice(0, index),
      ext: fileName.slice(index),
    };
  }

  function uniqueExportFilePath(targetDir, fileName) {
    const normalized = normalizeFileName(fileName);
    const { base, ext } = splitNameExt(normalized);
    const fm = fileManager();

    let candidate = `${targetDir}/${normalized}`;
    let counter = 1;
    while (fm.fileExistsAtPath(candidate)) {
      candidate = `${targetDir}/${base}-${counter}${ext}`;
      counter += 1;
      if (counter > 10000) {
        throw new Error(`Too many duplicate filenames: ${fileName}`);
      }
    }

    return candidate;
  }

  function generateSessionId() {
    return `session-${NSUUID.UUID().UUIDString()}`;
  }

  function pruneExpiredSessions() {
    const ids = Object.keys(sessionStore);
    const now = nowTimestamp();

    ids.forEach((sessionId) => {
      const session = sessionStore[sessionId];
      if (!session) return;

      if (now - session.createdAt > SESSION_TTL_MS) {
        try {
          destroySession(sessionId, "expired");
        } catch (error) {
          console.log(`[ImportEverything] Failed to prune session ${sessionId}: ${String(error)}`);
        }
      }
    });
  }

  function getSessionOrThrow(sessionId) {
    const session = sessionStore[sessionId];
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (nowTimestamp() - session.createdAt > SESSION_TTL_MS) {
      destroySession(sessionId, "expired");
      throw new Error(`Session expired: ${sessionId}`);
    }

    return session;
  }

  function destroySession(sessionId, reason) {
    const session = sessionStore[sessionId];
    if (!session) {
      return;
    }

    try {
      if (session.fileHandle) {
        session.fileHandle.closeFile();
      }
    } catch (error) {
      console.log(`[ImportEverything] closeFile failed for ${sessionId}: ${String(error)}`);
    }

    try {
      resetFileAtPath(session.tempPath);
    } catch (error) {
      console.log(`[ImportEverything] temp reset failed for ${sessionId}: ${String(error)}`);
    }

    delete sessionStore[sessionId];

    if (reason) {
      console.log(`[ImportEverything] Session ${sessionId} destroyed: ${reason}`);
    }
  }

  function base64ToData(base64Input) {
    const base64 = String(base64Input || "").replace(/\s+/g, "");
    if (base64.length === 0) {
      return NSData.data();
    }

    const dataUrl = `data:application/octet-stream;base64,${base64}`;
    const url = NSURL.URLWithString(dataUrl);
    if (!url) {
      throw new Error("Failed to create data URL for base64 decode");
    }

    const data = NSData.dataWithContentsOfURL(url);
    if (!data) {
      throw new Error("NSData.dataWithContentsOfURL failed to decode base64 chunk");
    }

    return data;
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

  function savePdfInit(context, payload) {
    try {
      pruneExpiredSessions();
      validatePayloadObject(payload, "savePdfInit");

      const fileName = normalizeFileName(payload.fileName);
      const mimeType = String(payload.mimeType || "application/pdf");
      if (mimeType !== "application/pdf") {
        return responseFail("INVALID_MIME_TYPE", `Unsupported mimeType: ${mimeType}`);
      }

      const expectedByteLength = Number(payload.expectedByteLength || 0);
      if (!Number.isFinite(expectedByteLength) || expectedByteLength <= 0) {
        return responseFail("INVALID_EXPECTED_BYTE_LENGTH", `Invalid expectedByteLength: ${payload.expectedByteLength}`);
      }

      const targetDir = exportDirectoryPath();
      const tempDir = tempDirectoryPath();
      const sessionId = generateSessionId();
      const tempPath = `${tempDir}/${sessionId}.part`;
      resetFileAtPath(tempPath);

      const fileHandle = NSFileHandle.fileHandleForWritingAtPath(tempPath);
      if (!fileHandle) {
        return responseFail("FILE_HANDLE_CREATE_FAILED", `Failed to open file handle: ${tempPath}`);
      }

      sessionStore[sessionId] = {
        sessionId,
        fileName,
        targetDir,
        tempPath,
        mimeType,
        fileHandle,
        receivedChunks: 0,
        totalChunks: null,
        expectedByteLength,
        receivedByteLength: 0,
        createdAt: nowTimestamp(),
      };

      const response = responseOk("INIT_OK", "Session created", {
        sessionId,
        maxChunkChars: MAX_CHUNK_CHARS,
        fileName,
        targetDir,
      });
      assertBridgeResponseShape(response, "savePdfInit");
      return response;
    } catch (error) {
      return responseFail("INIT_EXCEPTION", `savePdfInit error: ${String(error)}`);
    }
  }

  function savePdfChunk(context, payload) {
    try {
      pruneExpiredSessions();
      validatePayloadObject(payload, "savePdfChunk");

      const sessionId = String(payload.sessionId || "");
      const session = getSessionOrThrow(sessionId);

      const chunkIndex = Number(payload.chunkIndex);
      if (!Number.isFinite(chunkIndex) || chunkIndex < 0) {
        return responseFail("INVALID_CHUNK_INDEX", `Invalid chunkIndex: ${payload.chunkIndex}`, {
          sessionId,
        });
      }

      if (chunkIndex !== session.receivedChunks) {
        return responseFail("CHUNK_ORDER_MISMATCH", `Expected chunkIndex ${session.receivedChunks}, got ${chunkIndex}`, {
          sessionId,
          expectedChunkIndex: session.receivedChunks,
          receivedChunkIndex: chunkIndex,
        });
      }

      const base64Chunk = String(payload.base64Chunk || "");
      const chunkCharLength = Number(payload.chunkCharLength);
      if (!Number.isFinite(chunkCharLength) || chunkCharLength < 0) {
        return responseFail("INVALID_CHUNK_CHAR_LENGTH", `Invalid chunkCharLength: ${payload.chunkCharLength}`, {
          sessionId,
          chunkIndex,
        });
      }

      if (base64Chunk.length !== chunkCharLength) {
        return responseFail("CHUNK_LENGTH_MISMATCH", `base64Chunk.length(${base64Chunk.length}) !== chunkCharLength(${chunkCharLength})`, {
          sessionId,
          chunkIndex,
        });
      }

      if (chunkCharLength > MAX_CHUNK_CHARS) {
        return responseFail("CHUNK_TOO_LARGE", `chunkCharLength exceeds limit ${MAX_CHUNK_CHARS}`, {
          sessionId,
          chunkIndex,
          chunkCharLength,
        });
      }

      const data = base64ToData(base64Chunk);
      const byteLength = Number(data.length());

      session.fileHandle.seekToEndOfFile();
      session.fileHandle.writeData(data);
      session.receivedChunks += 1;
      session.receivedByteLength += byteLength;

      const response = responseOk("CHUNK_OK", `Chunk accepted: ${chunkIndex}`, {
        sessionId,
        chunkIndex,
        receivedChunks: session.receivedChunks,
        receivedByteLength: session.receivedByteLength,
      });
      assertBridgeResponseShape(response, "savePdfChunk");
      return response;
    } catch (error) {
      return responseFail("CHUNK_EXCEPTION", `savePdfChunk error: ${String(error)}`);
    }
  }

  function savePdfFinalize(context, payload) {
    let sessionId = null;

    try {
      pruneExpiredSessions();
      validatePayloadObject(payload, "savePdfFinalize");

      sessionId = String(payload.sessionId || "");
      const session = getSessionOrThrow(sessionId);

      const totalChunks = Number(payload.totalChunks);
      if (!Number.isFinite(totalChunks) || totalChunks < 0) {
        return responseFail("INVALID_TOTAL_CHUNKS", `Invalid totalChunks: ${payload.totalChunks}`, {
          sessionId,
        });
      }

      if (session.receivedChunks !== totalChunks) {
        return responseFail("TOTAL_CHUNKS_MISMATCH", `receivedChunks(${session.receivedChunks}) !== totalChunks(${totalChunks})`, {
          sessionId,
          receivedChunks: session.receivedChunks,
          totalChunks,
        });
      }

      const expectedByteLength = Number(payload.expectedByteLength);
      if (!Number.isFinite(expectedByteLength) || expectedByteLength <= 0) {
        return responseFail("INVALID_EXPECTED_BYTE_LENGTH", `Invalid expectedByteLength: ${payload.expectedByteLength}`, {
          sessionId,
        });
      }

      if (session.receivedByteLength !== expectedByteLength) {
        return responseFail("BYTE_LENGTH_MISMATCH", `receivedByteLength(${session.receivedByteLength}) !== expectedByteLength(${expectedByteLength})`, {
          sessionId,
          receivedByteLength: session.receivedByteLength,
          expectedByteLength,
        });
      }

      session.fileHandle.synchronizeFile();
      session.fileHandle.closeFile();
      session.fileHandle = null;

      const targetFilePath = uniqueExportFilePath(session.targetDir, session.fileName);
      const moved = fileManager().moveItemAtPathToPath(session.tempPath, targetFilePath);
      if (!moved) {
        return responseFail("FINAL_MOVE_FAILED", `Failed to move temp file to target path`, {
          sessionId,
          tempPath: session.tempPath,
          targetFilePath,
        });
      }

      const finalData = NSData.dataWithContentsOfFile(targetFilePath);
      const finalLength = finalData ? Number(finalData.length()) : 0;
      if (!finalData || finalLength !== expectedByteLength) {
        return responseFail("FINAL_SIZE_MISMATCH", `Final file length mismatch: ${finalLength}`, {
          sessionId,
          expectedByteLength,
          finalLength,
          targetFilePath,
        });
      }

      const importResult = appInstance().importDocument(targetFilePath);

      delete sessionStore[sessionId];

      const response = responseOk("FINALIZE_OK", "File saved and imported", {
        sessionId,
        savedPath: targetFilePath,
        importResult: toBridgePayload(importResult),
        expectedByteLength,
        finalLength,
      });
      assertBridgeResponseShape(response, "savePdfFinalize");
      return response;
    } catch (error) {
      if (sessionId) {
        try {
          destroySession(sessionId, "finalize-exception");
        } catch (cleanupError) {
          console.log(`[ImportEverything] finalize cleanup failed: ${String(cleanupError)}`);
        }
      }

      return responseFail("FINALIZE_EXCEPTION", `savePdfFinalize error: ${String(error)}`);
    }
  }

  function savePdfAbort(context, payload) {
    try {
      pruneExpiredSessions();
      validatePayloadObject(payload, "savePdfAbort");

      const sessionId = String(payload.sessionId || "");
      if (!sessionId) {
        return responseFail("INVALID_SESSION_ID", "sessionId is required");
      }

      if (!sessionStore[sessionId]) {
        return responseOk("ABORT_NOOP", "Session already absent", {
          sessionId,
        });
      }

      destroySession(sessionId, `abort:${String(payload.reason || "unknown")}`);

      const response = responseOk("ABORT_OK", "Session aborted and temp data cleaned", {
        sessionId,
      });
      assertBridgeResponseShape(response, "savePdfAbort");
      return response;
    } catch (error) {
      return responseFail("ABORT_EXCEPTION", `savePdfAbort error: ${String(error)}`);
    }
  }

  function ping(context, payload) {
    const response = responseOk("PING_OK", "Ping received", {
      now: new Date().toISOString(),
      source: "mn-addon",
      payload: toBridgePayload(payload),
      addon: context.addon && context.addon.window ? "available" : "unavailable",
    });
    assertBridgeResponseShape(response, "ping");
    return response;
  }

  function echo(context, payload) {
    const response = responseOk("ECHO_OK", "Echo received", {
      echoed: toBridgePayload(payload),
    });
    assertBridgeResponseShape(response, "echo");
    return response;
  }

  function closePanel(context, payload) {
    context.closePanel(context.controller);
    const response = responseOk("CLOSE_PANEL_OK", "Panel closed", {
      closed: true,
      payload: toBridgePayload(payload),
    });
    assertBridgeResponseShape(response, "closePanel");
    return response;
  }

  const commands = {
    ping,
    echo,
    closePanel,
    savePdfInit,
    savePdfChunk,
    savePdfFinalize,
    savePdfAbort,
  };

  return {
    commands,
  };
})();
