import { registerObjectURLForFile } from "../parsers/objectUrlRegistry";

// 导入的图片会以 base64 走 bridge，单张体积直接决定整体耗时。
// 卡片上的图片按卡片宽度显示，1600 像素长边已经足够，质量从高到低逐级试。
const MAX_IMAGE_EDGE = 1600;
const MAX_IMAGE_SIZE = 220_000;

const JPEG_QUALITIES = [0.88, 0.8, 0.72, 0.64, 0.56, 0.48];

function decodeImageSource(blob) {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(blob);
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      safeRevokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      safeRevokeObjectURL(url);
      reject(new Error("image decode failed"));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, mimeType, quality);
  });
}

// 解析阶段只处理超大图片，保证预览尽快出现；导入阶段再用默认的紧凑参数整体压缩。
export const PARSE_IMAGE_LIMITS = {
  maxEdge: 4096,
  maxSize: 1_000_000,
};

export async function compressImage(blob, options = {}) {
  if (!blob || typeof blob !== "object" || typeof blob.size !== "number") {
    return blob;
  }

  const maxEdge = Number(options.maxEdge) > 0 ? Number(options.maxEdge) : MAX_IMAGE_EDGE;
  const maxSize = Number(options.maxSize) > 0 ? Number(options.maxSize) : MAX_IMAGE_SIZE;

  let headerSize = null;
  try {
    headerSize = readImageSizeFromBytes(await readBlobHeader(blob));
  } catch (error) {
    headerSize = null;
  }

  const headerEdge = headerSize ? Math.max(headerSize.width, headerSize.height) : 0;
  if (blob.size <= maxSize && (headerEdge <= 0 || headerEdge <= maxEdge)) {
    return blob;
  }

  let source = null;
  try {
    source = await decodeImageSource(blob);
  } catch (error) {
    console.log(`[ImportEverything] image decode failed: ${String(error)}`);
    return blob;
  }

  try {
    const sourceWidth = source.width || source.naturalWidth || 0;
    const sourceHeight = source.height || source.naturalHeight || 0;
    if (!sourceWidth || !sourceHeight) {
      return blob;
    }

    let scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
    if (blob.size > maxSize) {
      scale = Math.min(scale, Math.sqrt(maxSize / blob.size));
    }

    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    // JPEG 不带透明通道，先铺白底，避免透明截图变黑。
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(source, 0, 0, width, height);

    let result = null;
    for (const quality of JPEG_QUALITIES) {
      result = await canvasToBlob(canvas, "image/jpeg", quality);
      if (result && result.size <= maxSize) {
        break;
      }
    }

    return result && result.size < blob.size ? result : blob;
  } finally {
    if (source && typeof source.close === "function") {
      source.close();
    }
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
    const rawBlob = base64ToBlob(parsed.mimeType, parsed.data);
    const blob = await compressImage(rawBlob, PARSE_IMAGE_LIMITS);
    return createImageInfo(blob, blob.type || parsed.mimeType, sharedOptions);
  }

  const entry = buildZipEntryCandidates(src)
    .map((candidate) => zip.file(candidate))
    .find(Boolean);
  if (!entry) {
    return null;
  }

  const rawBlob = await entry.async("blob");
  const blob = await compressImage(rawBlob, PARSE_IMAGE_LIMITS);

  return createImageInfo(blob, blob.type || "image/png", sharedOptions);
}
