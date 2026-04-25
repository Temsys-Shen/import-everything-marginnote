import MNBridge from "../lib/mnBridge";

const DEFAULT_MAX_CHUNK_CHARS = 16000;

export function uint8ToBase64(bytes) {
  const step = 0x8000;
  const parts = [];

  for (let index = 0; index < bytes.length; index += step) {
    const chunk = bytes.subarray(index, index + step);
    parts.push(String.fromCharCode(...chunk));
  }

  return btoa(parts.join(""));
}

export function splitByLength(input, maxLength) {
  if (!input || input.length === 0) {
    return [];
  }

  const result = [];
  for (let index = 0; index < input.length; index += maxLength) {
    result.push(input.slice(index, index + maxLength));
  }
  return result;
}

export async function transferBinaryToBridge(options) {
  const {
    bytes,
    fileName,
    mimeType,
    commands,
    buildFinalizePayload,
    onProgress,
  } = options;

  if (!(bytes instanceof Uint8Array)) {
    throw new Error("transferBinaryToBridge requires Uint8Array bytes");
  }

  const initResponse = await MNBridge.send(commands.init, {
    fileName,
    mimeType,
    expectedByteLength: bytes.length,
  });

  if (!initResponse || initResponse.ok !== true) {
    throw new Error(initResponse && initResponse.message ? initResponse.message : `${commands.init} failed`);
  }

  const sessionId = initResponse.data.sessionId;
  const maxChunkChars = Math.max(
    1024,
    Math.min(
      DEFAULT_MAX_CHUNK_CHARS,
      Number(initResponse.data.maxChunkChars || DEFAULT_MAX_CHUNK_CHARS),
    ),
  );
  const base64 = uint8ToBase64(bytes);
  const chunks = splitByLength(base64, maxChunkChars);

  try {
    for (let index = 0; index < chunks.length; index += 1) {
      const response = await MNBridge.send(commands.chunk, {
        sessionId,
        chunkIndex: index,
        base64Chunk: chunks[index],
        chunkCharLength: chunks[index].length,
      });

      if (!response || response.ok !== true) {
        throw new Error(response && response.message ? response.message : `${commands.chunk} failed`);
      }

      if (typeof onProgress === "function") {
        onProgress({
          phase: "transfer",
          chunkIndex: index,
          current: index + 1,
          total: chunks.length,
          totalChunks: chunks.length,
          ratioHint: chunks.length === 0 ? 0.9 : 0.55 + (((index + 1) / chunks.length) * 0.4),
          message: `正在传输${index + 1}/${chunks.length}`,
        });
      }
    }

    const finalResponse = await MNBridge.send(
      commands.finalize,
      buildFinalizePayload({
        sessionId,
        totalChunks: chunks.length,
        expectedByteLength: bytes.length,
      }),
    );

    if (!finalResponse || finalResponse.ok !== true) {
      throw new Error(finalResponse && finalResponse.message ? finalResponse.message : `${commands.finalize} failed`);
    }

    return finalResponse;
  } catch (error) {
    try {
      await MNBridge.send(commands.abort, {
        sessionId,
        reason: error && error.message ? error.message : String(error),
      });
    } catch (abortError) {
      // keep the original error
    }
    throw error;
  }
}
