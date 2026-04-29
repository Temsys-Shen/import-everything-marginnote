import { describe, expect, it } from "vitest";
import { detectMindmapSourceType } from "./sourceTypes";

describe("detectMindmapSourceType", () => {
  it("detects newly supported mindmap source types", () => {
    expect(detectMindmapSourceType({ name: "map.xmind" })).toBe("xmind");
    expect(detectMindmapSourceType({ name: "map.mm" })).toBe("freemind");
    expect(detectMindmapSourceType({ name: "map.opml" })).toBe("opml");
    expect(detectMindmapSourceType({ name: "map.mmap" })).toBe("mindmanager");
    expect(detectMindmapSourceType({ name: "map.xmmap" })).toBe("mindmanager");
    expect(detectMindmapSourceType({ name: "map.itmz" })).toBe("ithoughts");
  });

  it("keeps unsupported extensions unsupported", () => {
    expect(detectMindmapSourceType({ name: "map.unknown" })).toBe("unsupported");
  });
});
