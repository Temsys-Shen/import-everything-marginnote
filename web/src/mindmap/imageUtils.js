import { registerObjectURLForFile } from "../parsers/objectUrlRegistry";

const MAX_IMAGE_SIZE = 1_000_000;

const JPEG_QUALITIES = [0.85, 0.7, 0.55, 0.4, 0.25, 0.1];

export async function compressImage(blob) {
  if (blob.size <= MAX_IMAGE_SIZE) return blob;

  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.sqrt(MAX_IMAGE_SIZE / blob.size);
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, width, height);

    for (const q of JPEG_QUALITIES) {
      const result = await new Promise((resolve) => {
        canvas.toBlob(resolve, "image/jpeg", q);
      });
      if (result && result.size <= MAX_IMAGE_SIZE) return result;
    }

    return new Promise((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.1);
    });
  } finally {
    bitmap.close();
  }
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function inlineBlobImages(root) {
  if (!root || typeof root.querySelectorAll !== "function") {
    return;
  }

  const images = Array.from(root.querySelectorAll("img"));
  for (const img of images) {
    const src = String(img.getAttribute("src") || "");
    if (!/^(blob|file):/i.test(src)) {
      continue;
    }

    try {
      const response = await fetch(src);
      if (!response.ok) {
        throw new Error(`fetch failed with status ${response.status}`);
      }
      const blob = await response.blob();
      const base64 = await blobToBase64(blob);
      img.setAttribute("src", `data:${blob.type || "application/octet-stream"};base64,${base64}`);
    } catch (error) {
      console.log(`[ImportEverything] inline blob image failed: ${String(error)}`);
    }
  }
}

const IMAGE_DIMENSION_TIMEOUT_MS = 1500;

function loadImageDimensionsFromObjectUrl(objectUrl, timeoutMs = IMAGE_DIMENSION_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    let timer = null;

    const finish = (size) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timer !== null) {
        clearTimeout(timer);
      }
      img.onload = null;
      img.onerror = null;
      resolve(size);
    };

    if (typeof setTimeout === "function") {
      // Corrupt payloads never fire load/error in some WebViews; never block the
      // import on a broken image.
      timer = setTimeout(() => finish({ width: 0, height: 0 }), timeoutMs);
    }

    img.onload = () => finish({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => finish({ width: 0, height: 0 });
    img.src = objectUrl;
  });
}

function base64ToBlob(mimeType, base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType || "image/png" });
}

function safeRevokeObjectURL(objectUrl) {
  try {
    URL.revokeObjectURL(objectUrl);
  } catch (error) {
    // 某些环境（如 jsdom）没有实现，忽略即可。
  }
}

// 直接读图片头拿像素尺寸，避免为每张图触发一次完整的图片解码。
function readImageSizeFromBytes(buffer) {
  if (!buffer || typeof buffer.byteLength !== "number" || buffer.byteLength < 16) {
    return null;
  }

  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  // PNG
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && buffer.byteLength >= 24) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }

  // GIF
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && buffer.byteLength >= 10) {
    return { width: bytes[6] | (bytes[7] << 8), height: bytes[8] | (bytes[9] << 8) };
  }

  // JPEG：扫到 SOF 段
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 <= buffer.byteLength) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      if (marker === 0xff) {
        offset += 1;
        continue;
      }
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
        offset += 2;
        continue;
      }
      const segmentLength = view.getUint16(offset + 2);
      const isStartOfFrame = marker >= 0xc0 && marker <= 0xcf
        && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isStartOfFrame) {
        return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
      }
      if (segmentLength <= 0) {
        break;
      }
      offset += 2 + segmentLength;
    }
    return null;
  }

  // WebP
  if (
    buffer.byteLength >= 30
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    const format = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
    if (format === "VP8X") {
      return {
        width: 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)),
        height: 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)),
      };
    }
    if (format === "VP8 ") {
      return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
    }
    if (format === "VP8L") {
      const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
  }

  return null;
}

function resolveXmindImageSrc(source) {
  if (!source) {
    return "";
  }
  if (typeof source === "string") {
    return source.trim();
  }
  if (typeof source !== "object") {
    return "";
  }

  if (typeof source.src === "string" && source.src.trim()) {
    return source.src.trim();
  }

  const image = source.image;
  if (image && typeof image === "object" && typeof image.src === "string") {
    return image.src.trim();
  }

  return "";
}

function buildZipEntryCandidates(src) {
  const withoutScheme = src.replace(/^xap:/i, "").replace(/^\/+/, "");
  const candidates = [];
  const push = (value) => {
    const normalized = String(value || "").replace(/^\/+/, "");
    if (normalized && !candidates.includes(normalized)) {
      candidates.push(normalized);
    }
  };

  push(withoutScheme);
  try {
    push(decodeURIComponent(withoutScheme));
  } catch (error) {
    // Malformed escape sequences: keep the raw candidate only.
  }
  if (!/^resources\//i.test(withoutScheme)) {
    push(`resources/${withoutScheme}`);
  }

  return candidates;
}

function parseBase64DataUri(src) {
  const match = /^data:([^;,]*)?(;base64)?,(.*)$/s.exec(src);
  if (!match || !match[2]) {
    return null;
  }
  const data = String(match[3] || "").trim();
  if (!data) {
    return null;
  }
  return {
    mimeType: match[1] || "image/png",
    data,
  };
}

function readImageSizeFromBase64(base64) {
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return readImageSizeFromBytes(bytes.buffer);
  } catch (error) {
    return null;
  }
}

// 只取图片开头几 KB 用于读头部，避免把整张图都拷一遍。
function readBlobHeader(blob, byteLength = 4096) {
  const slice = typeof blob.slice === "function" ? blob.slice(0, byteLength) : blob;
  return slice.arrayBuffer();
}

async function resolveImageDimensions(blob, precomputedSize, fallbackWidth, fallbackHeight) {
  // 优先用 XMind 记录的画布尺寸，其次读图片头，最后才退回真正的解码。
  if (fallbackWidth > 0 && fallbackHeight > 0) {
    return { width: fallbackWidth, height: fallbackHeight };
  }

  const headerSize = precomputedSize
    || readImageSizeFromBytes(await readBlobHeader(blob));
  if (headerSize && headerSize.width > 0 && headerSize.height > 0) {
    return headerSize;
  }

  const measureUrl = URL.createObjectURL(blob);
  try {
    return await loadImageDimensionsFromObjectUrl(measureUrl);
  } finally {
    safeRevokeObjectURL(measureUrl);
  }
}

async function createImageInfo(blob, mimeType, options) {
  // 预览用 blob URL（比 data URI 便宜得多），base64 推迟到真正导入时再生成。
  const blobUrl = registerObjectURLForFile(options.file, URL.createObjectURL(blob));
  const dimensions = await resolveImageDimensions(
    blob,
    options.precomputedSize,
    options.fallbackWidth,
    options.fallbackHeight,
  );

  return {
    mimeType,
    blob,
    blobUrl,
    width: dimensions.width || 0,
    height: dimensions.height || 0,
  };
}

export async function extractXmindImage(source, zip, options = {}) {
  const src = resolveXmindImageSrc(source);
  if (!src) {
    return null;
  }

  const fallbackWidth = Number(options.fallbackWidth) || 0;
  const fallbackHeight = Number(options.fallbackHeight) || 0;
  const sharedOptions = {
    file: options.file || null,
    fallbackWidth,
    fallbackHeight,
  };

  if (/^data:/i.test(src)) {
    const parsed = parseBase64DataUri(src);
    if (!parsed) {
      console.log("[ImportEverything] unsupported inline xmind image src");
      return null;
    }
    return createImageInfo(base64ToBlob(parsed.mimeType, parsed.data), parsed.mimeType, {
      ...sharedOptions,
      precomputedSize: readImageSizeFromBase64(parsed.data),
    });
  }

  const entry = buildZipEntryCandidates(src)
    .map((candidate) => zip.file(candidate))
    .find(Boolean);
  if (!entry) {
    return null;
  }

  const rawBlob = await entry.async("blob");
  const blob = await compressImage(rawBlob);

  return createImageInfo(blob, blob.type || "image/png", sharedOptions);
}
