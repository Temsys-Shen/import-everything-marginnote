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

function loadImageDimensions(mimeType, base64) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onload = null;
      img.onerror = null;
    };
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = `data:${mimeType};base64,${base64}`;
  });
}

export async function extractXmindImage(topic, zip) {
  const image = topic.image;
  if (!image || typeof image !== "object") return null;

  const src = image.src;
  if (!src || typeof src !== "string") return null;

  const entry = zip.file(src.replace(/^xap:/, ''));
  if (!entry) return null;

  const blob = await entry.async("blob");
  const compressed = await compressImage(blob);
  const data = await blobToBase64(compressed);
  const mimeType = compressed.type || "image/png";
  const dimensions = await loadImageDimensions(mimeType, data);

  return { mimeType, data, ...dimensions };
}
