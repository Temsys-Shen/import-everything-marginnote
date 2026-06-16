import { describe, expect, it, vi, beforeAll } from "vitest";
import { compressImage, blobToBase64 } from "./imageUtils";

beforeAll(() => {
  if (typeof createImageBitmap === "undefined") {
    vi.stubGlobal("createImageBitmap", async (blob) => ({
      width: 100,
      height: 100,
      close: () => {},
    }));
  }

  if (typeof HTMLCanvasElement !== "undefined") {
    HTMLCanvasElement.prototype.getContext = function () {
      return {
        drawImage: () => {},
        canvas: this,
      };
    };
    HTMLCanvasElement.prototype.toBlob = function (cb, type, quality) {
      const blob = new Blob(["fake-image"], { type: type || "image/png" });
      cb(blob);
    };
  }
});

function makeBlob(size, type = "image/png") {
  const buf = new Uint8Array(size);
  for (let i = 0; i < size; i++) buf[i] = i & 0xff;
  return new Blob([buf], { type });
}

describe("compressImage", () => {
  it("不压缩小于1MB的图片", async () => {
    const blob = makeBlob(1000);
    const result = await compressImage(blob);
    expect(result.size).toBe(1000);
  });

  it("压缩大于1MB的图片到1MB以内", async () => {
    const blob = makeBlob(2_000_000);
    const result = await compressImage(blob);
    expect(result.size).toBeLessThanOrEqual(1_000_000);
  });
});

describe("blobToBase64", () => {
  it("将blob转为base64字符串", async () => {
    const blob = new Blob(["hello"], { type: "text/plain" });
    const b64 = await blobToBase64(blob);
    expect(b64).toBe("aGVsbG8=");
  });

  it("base64不包含逗号或data:前缀", async () => {
    const blob = new Blob(["test"], { type: "text/plain" });
    const b64 = await blobToBase64(blob);
    expect(b64).not.toContain(",");
    expect(b64).not.toContain("data:");
  });
});

describe("extractXmindImage", () => {
  it("topic无image时返回null", async () => {
    const { extractXmindImage } = await import("./imageUtils");
    const result = await extractXmindImage({}, { file: () => null });
    expect(result).toBeNull();
  });

  it("topic.image.src指向不存在文件时返回null", async () => {
    const { extractXmindImage } = await import("./imageUtils");
    const zip = { file: () => null };
    const topic = { image: { src: "missing.png" } };
    const result = await extractXmindImage(topic, zip);
    expect(result).toBeNull();
  });

  it("提取有效图片", async () => {
    const { extractXmindImage } = await import("./imageUtils");
    const fakeBlob = new Blob(["fake-png"], { type: "image/png" });
    const zip = { file: () => ({ async: () => fakeBlob }) };
    const topic = { image: { src: "image.png" } };
    const result = await extractXmindImage(topic, zip);
    expect(result).not.toBeNull();
    expect(typeof result.data).toBe("string");
    expect(result.data.length).toBeGreaterThan(0);
    expect(result.mimeType).toBe("image/png");
  });
});
