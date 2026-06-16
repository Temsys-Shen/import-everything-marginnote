import { describe, expect, it } from "vitest";
import { createMindmapImportNode } from "./model";

describe("createMindmapImportNode", () => {
  it("没有image字段时image为null", () => {
    const node = createMindmapImportNode({ text: "hello" });
    expect(node.image).toBeNull();
  });

  it("有效的image对象被保留", () => {
    const node = createMindmapImportNode({
      text: "test",
      image: { mimeType: "image/jpeg", data: "base64data" },
    });
    expect(node.image).toEqual({ mimeType: "image/jpeg", data: "base64data" });
  });

  it("缺少data的image对象被舍弃", () => {
    const node = createMindmapImportNode({
      text: "test",
      image: { mimeType: "image/jpeg" },
    });
    expect(node.image).toBeNull();
  });

  it("缺少mimeType的image对象被舍弃", () => {
    const node = createMindmapImportNode({
      text: "test",
      image: { data: "base64data" },
    });
    expect(node.image).toBeNull();
  });

  it("非对象image被舍弃", () => {
    const node = createMindmapImportNode({
      text: "test",
      image: "not-an-object",
    });
    expect(node.image).toBeNull();
  });
});
