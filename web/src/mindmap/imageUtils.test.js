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

  if (typeof document === "undefined") {
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage: () => {},
      }),
      toBlob: (cb, type) => {
        const blob = new Blob(["fake-image"], { type: type || "image/png" });
        cb(blob);
      },
    };
    vi.stubGlobal("document", {
      createElement: () => canvas,
    });
  }

  if (typeof Image === "undefined") {
    vi.stubGlobal("Image", class {
      constructor() {
        this.naturalWidth = 200;
        this.naturalHeight = 150;
        this.onload = null;
        this.onerror = null;
        this._src = "";
      }
      set src(value) {
        this._src = value;
        if (this.onload) this.onload();
      }
      get src() { return this._src; }
    });
  }

  if (typeof FileReader === "undefined") {
    const btoa = (str) => Buffer.from(str, "binary").toString("base64");
    vi.stubGlobal("FileReader", class {
      onload = null;
      onerror = null;
      result = null;
      readAsDataURL(blob) {
        blob.text().then((text) => {
          this.result = `data:${blob.type || "application/octet-stream"};base64,${btoa(text)}`;
          if (this.onload) this.onload();
        }).catch((err) => {
          if (this.onerror) this.onerror(err);
        });
      }
    });
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
    expect(result.width).toBe(200);
    expect(result.height).toBe(150);
  });

  it("处理带有 xap: 前缀的图片路径", async () => {
    const { extractXmindImage } = await import("./imageUtils");
    let calledPath;
    const fakeBlob = new Blob(["fake-xap-png"], { type: "image/png" });
    const zip = {
      file: (path) => {
        calledPath = path;
        return path === "resources/image.png" ? { async: () => fakeBlob } : null;
      },
    };
    const topic = { image: { src: "xap:resources/image.png" } };
    const result = await extractXmindImage(topic, zip);
    expect(calledPath).toBe("resources/image.png");
    expect(result).not.toBeNull();
    expect(result.data).toBe("ZmFrZS14YXAtcG5n");
    expect(result.mimeType).toBe("image/png");
    expect(result.width).toBe(200);
    expect(result.height).toBe(150);
  });
});
