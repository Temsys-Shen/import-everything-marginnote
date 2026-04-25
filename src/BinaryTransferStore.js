var __MN_BINARY_TRANSFER_STORE_MNImportEverythingAddon = (function () {
  const TEMP_DIR_NAME = "ImportEverythingChunkSessions";
  const SESSION_TTL_MS = 15 * 60 * 1000;
  const MAX_CHUNK_CHARS = 16000;
  const sessionStore = {};

  function appInstance() {
    return Application.sharedInstance();
  }

  function fileManager() {
    return NSFileManager.defaultManager();
  }

  function nowTimestamp() {
    return Date.now();
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

  function generateSessionId() {
    const uuidValue = NSUUID.UUID().UUIDString();
    return `session-${String(typeof uuidValue === "function" ? uuidValue() : uuidValue)}`;
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
      if (fileManager().fileExistsAtPath(session.tempPath)) {
        resetFileAtPath(session.tempPath);
      }
    } catch (error) {
      console.log(`[ImportEverything] temp reset failed for ${sessionId}: ${String(error)}`);
    }

    delete sessionStore[sessionId];

    if (reason) {
      console.log(`[ImportEverything] Session ${sessionId} destroyed: ${reason}`);
    }
  }

  function pruneExpiredSessions() {
    const now = nowTimestamp();
    Object.keys(sessionStore).forEach(function (sessionId) {
      const session = sessionStore[sessionId];
      if (!session) {
        return;
      }

      if (now - session.createdAt > SESSION_TTL_MS) {
        destroySession(sessionId, "expired");
      }
    });
  }

  function base64ToData(base64Input) {
    const base64 = String(base64Input || "").replace(/\s+/g, "");
    if (!base64) {
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

  function createSession(options) {
    pruneExpiredSessions();

    const fileName = String(options.fileName || "").trim();
    const expectedByteLength = Number(options.expectedByteLength || 0);
    if (!fileName) {
      throw new Error("fileName is required");
    }
    if (!Number.isFinite(expectedByteLength) || expectedByteLength <= 0) {
      throw new Error(`Invalid expectedByteLength: ${options.expectedByteLength}`);
    }

    const sessionId = generateSessionId();
    const tempPath = `${tempDirectoryPath()}/${sessionId}.part`;
    resetFileAtPath(tempPath);

    const fileHandle = NSFileHandle.fileHandleForWritingAtPath(tempPath);
    if (!fileHandle) {
      throw new Error(`Failed to open file handle: ${tempPath}`);
    }

    sessionStore[sessionId] = {
      sessionId: sessionId,
      fileName: fileName,
      mimeType: String(options.mimeType || "application/octet-stream"),
      expectedByteLength: expectedByteLength,
      tempPath: tempPath,
      receivedChunks: 0,
      receivedByteLength: 0,
      createdAt: nowTimestamp(),
      fileHandle: fileHandle,
      kind: String(options.kind || "binary"),
      metadata: options.metadata && typeof options.metadata === "object" ? options.metadata : {},
    };

    return {
      sessionId: sessionId,
      maxChunkChars: MAX_CHUNK_CHARS,
      tempPath: tempPath,
      fileName: fileName,
    };
  }

  function getSessionOrThrow(sessionId, expectedKind) {
    pruneExpiredSessions();
    const session = sessionStore[String(sessionId || "")];
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (expectedKind && session.kind !== expectedKind) {
      throw new Error(`Session kind mismatch: expected ${expectedKind}, got ${session.kind}`);
    }

    return session;
  }

  function appendChunk(sessionId, chunkIndex, base64Chunk, chunkCharLength, expectedKind) {
    const session = getSessionOrThrow(sessionId, expectedKind);
    const index = Number(chunkIndex);
    const charLength = Number(chunkCharLength);

    if (!Number.isFinite(index) || index < 0) {
      throw new Error(`Invalid chunkIndex: ${chunkIndex}`);
    }
    if (index !== session.receivedChunks) {
      throw new Error(`Expected chunkIndex ${session.receivedChunks}, got ${index}`);
    }
    if (!Number.isFinite(charLength) || charLength < 0) {
      throw new Error(`Invalid chunkCharLength: ${chunkCharLength}`);
    }
    if (String(base64Chunk || "").length !== charLength) {
      throw new Error(`base64Chunk.length mismatch for chunk ${index}`);
    }
    if (charLength > MAX_CHUNK_CHARS) {
      throw new Error(`chunkCharLength exceeds limit ${MAX_CHUNK_CHARS}`);
    }

    const data = base64ToData(base64Chunk);
    const byteLength = Number(data.length());

    session.fileHandle.seekToEndOfFile();
    session.fileHandle.writeData(data);
    session.receivedChunks += 1;
    session.receivedByteLength += byteLength;

    return {
      sessionId: session.sessionId,
      chunkIndex: index,
      receivedChunks: session.receivedChunks,
      receivedByteLength: session.receivedByteLength,
      tempPath: session.tempPath,
    };
  }

  function completeSession(sessionId, totalChunks, expectedByteLength, expectedKind) {
    const session = getSessionOrThrow(sessionId, expectedKind);
    const chunkCount = Number(totalChunks);
    const byteLength = Number(expectedByteLength);

    if (!Number.isFinite(chunkCount) || chunkCount < 0) {
      throw new Error(`Invalid totalChunks: ${totalChunks}`);
    }
    if (!Number.isFinite(byteLength) || byteLength <= 0) {
      throw new Error(`Invalid expectedByteLength: ${expectedByteLength}`);
    }
    if (session.receivedChunks !== chunkCount) {
      throw new Error(`receivedChunks(${session.receivedChunks}) !== totalChunks(${chunkCount})`);
    }
    if (session.receivedByteLength !== byteLength) {
      throw new Error(`receivedByteLength(${session.receivedByteLength}) !== expectedByteLength(${byteLength})`);
    }

    session.fileHandle.synchronizeFile();
    session.fileHandle.closeFile();
    session.fileHandle = null;

    const finalData = NSData.dataWithContentsOfFile(session.tempPath);
    const finalLength = finalData ? Number(finalData.length()) : 0;
    if (!finalData || finalLength !== byteLength) {
      throw new Error(`Final file length mismatch: ${finalLength}`);
    }

    return {
      sessionId: session.sessionId,
      tempPath: session.tempPath,
      fileName: session.fileName,
      mimeType: session.mimeType,
      expectedByteLength: byteLength,
      finalLength: finalLength,
      kind: session.kind,
      metadata: session.metadata,
    };
  }

  return {
    MAX_CHUNK_CHARS: MAX_CHUNK_CHARS,
    createSession: createSession,
    appendChunk: appendChunk,
    completeSession: completeSession,
    getSessionOrThrow: getSessionOrThrow,
    destroySession: destroySession,
  };
})();
