import { describe, expect, it } from "vitest";
import { detectMindmapSourceType, detectZipMindmapSourceType } from "./sourceTypes";

describe("detectMindmapSourceType", () => {
  it("detects newly supported mindmap source types", () => {
    expect(detectMindmapSourceType({ name: "map.xmind" })).toBe("xmind");
    expect(detectMindmapSourceType({ name: "map.mm" })).toBe("freemind");
    expect(detectMindmapSourceType({ name: "map.opml" })).toBe("opml");
    expect(detectMindmapSourceType({ name: "map.mmap" })).toBe("mindmanager");
    expect(detectMindmapSourceType({ name: "map.xmmap" })).toBe("mindmanager");
    expect(detectMindmapSourceType({ name: "map.itmz" })).toBe("ithoughts");
    expect(detectMindmapSourceType({ name: "map.smmx" })).toBe("simplemind");
  });

  it("treats .zip as a container whose format is decided by content", () => {
    expect(detectMindmapSourceType({ name: "map.zip" })).toBe("zip");
  });

  it("keeps unsupported extensions unsupported", () => {
    expect(detectMindmapSourceType({ name: "map.unknown" })).toBe("unsupported");
  });
});

describe("detectZipMindmapSourceType", () => {
  it("detects the format from zip entries", () => {
    expect(detectZipMindmapSourceType(["content.json", "metadata.json", "resources/x.png"])).toBe("xmind");
    expect(detectZipMindmapSourceType(["content.xml"])).toBe("xmind");
    expect(detectZipMindmapSourceType(["MapData.xml"])).toBe("ithoughts");
    expect(detectZipMindmapSourceType(["document/mindmap.xml"])).toBe("simplemind");
    expect(detectZipMindmapSourceType(["Document.xml"])).toBe("mindmanager");
  });

  it("returns an empty string when nothing matches", () => {
    expect(detectZipMindmapSourceType(["random.txt"])).toBe("");
    expect(detectZipMindmapSourceType([])).toBe("");
    expect(detectZipMindmapSourceType()).toBe("");
  });
});
