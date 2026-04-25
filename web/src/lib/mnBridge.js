const BRIDGE_SCHEME = "mnaddon://bridge?payload=";

function nextRequestId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeBridgeError(error, fallbackCommand, fallbackChunkIndex = null) {
  if (!error) {
    return {
      command: fallbackCommand,
      chunkIndex: fallbackChunkIndex,
      message: "Unknown bridge error",
    };
  }

  if (error instanceof Error) {
    return {
      command: fallbackCommand,
      chunkIndex: fallbackChunkIndex,
      message: error.message,
      stack: error.stack || "",
    };
  }

  if (typeof error === "object") {
    return {
      command: error.command || fallbackCommand,
      chunkIndex:
        error.chunkIndex !== undefined && error.chunkIndex !== null
          ? error.chunkIndex
          : fallbackChunkIndex,
      code: error.code || "UNKNOWN_ERROR",
      message: error.message || JSON.stringify(error),
      details: error.details || null,
    };
  }

  return {
    command: fallbackCommand,
    chunkIndex: fallbackChunkIndex,
    message: String(error),
  };
}

function ensureBridgeReceiver() {
  if (typeof window.__MNBridgePending !== "object") {
    window.__MNBridgePending = {};
  }

  if (typeof window.__MNBridgeReceive_MNImportEverythingAddon === "function") {
    return;
  }

  window.__MNBridgeReceive_MNImportEverythingAddon = (raw) => {
    const response = JSON.parse(raw);
    const pending = window.__MNBridgePending[response.requestId];
    if (!pending) {
      return;
    }

    delete window.__MNBridgePending[response.requestId];

    if (response.error) {
      pending.reject(response.error);
      return;
    }

    pending.resolve(response.payload);
  };
}

function send(command, payload = null) {
  ensureBridgeReceiver();

  const requestId = nextRequestId();
  const message = {
    command,
    requestId,
    payload,
    error: null,
  };

  return new Promise((resolve, reject) => {
    window.__MNBridgePending[requestId] = {
      resolve(result) {
        resolve(result);
      },
      reject(error) {
        reject(error);
      },
    };

    const encoded = encodeURIComponent(JSON.stringify(message));
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = `${BRIDGE_SCHEME}${encoded}`;
    document.body.appendChild(iframe);
    setTimeout(() => {
      try {
        iframe.remove();
      } catch (error) {
        // no-op
      }
    }, 600);
  });
}

async function sendChunked(options) {
  const {
    initCommand,
    chunkCommand,
    finalizeCommand,
    abortCommand,
    initPayload,
    chunks,
    buildChunkPayload,
    finalizePayload,
    onProgress,
  } = options;

  let sessionId = null;

  try {
    const initResponse = await send(initCommand, initPayload);
    sessionId = initResponse && initResponse.data ? initResponse.data.sessionId : null;

    for (let index = 0; index < chunks.length; index += 1) {
      const payload = buildChunkPayload(chunks[index], index, sessionId);
      const response = await send(chunkCommand, payload);

      if (typeof onProgress === "function") {
        onProgress({
          stage: "chunk",
          command: chunkCommand,
          chunkIndex: index,
          totalChunks: chunks.length,
          response,
        });
      }
    }

    const finalResponse = await send(finalizeCommand, finalizePayload(sessionId));

    if (typeof onProgress === "function") {
      onProgress({
        stage: "finalize",
        command: finalizeCommand,
        chunkIndex: chunks.length - 1,
        totalChunks: chunks.length,
        response: finalResponse,
      });
    }

    return finalResponse;
  } catch (error) {
    const normalized = normalizeBridgeError(error, chunkCommand);

    if (abortCommand && sessionId) {
      try {
        await send(abortCommand, {
          sessionId,
          reason: normalized.message,
        });
      } catch (abortError) {
        const abortNormalized = normalizeBridgeError(abortError, abortCommand);
        normalized.abortError = abortNormalized;
      }
    }

    throw normalized;
  }
}

const MNBridge = {
  send,
  sendChunked,
};

export default MNBridge;
