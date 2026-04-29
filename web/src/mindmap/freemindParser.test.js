import { describe, expect, it } from "vitest";
import { parseFreeMindFile } from "./freemindParser";

function createMindmapFile(name, content) {
  return {
    name,
    async text() {
      return content;
    },
  };
}

describe("parseFreeMindFile", () => {
  it("parses a standard FreeMind tree with notes", async () => {
    const file = createMindmapFile("study.mm", `<?xml version="1.0" encoding="UTF-8"?>
      <map version="0.9.0">
        <node ID="root-1" TEXT="Root Topic">
          <richcontent TYPE="NOTE"><html><body>Root note</body></html></richcontent>
          <node ID="child-1" TEXT="Child A" />
          <node ID="child-2" TEXT="Child B">
            <richcontent TYPE="NOTE"><html><body>Child note</body></html></richcontent>
          </node>
        </node>
      </map>`);

    const result = await parseFreeMindFile(file);

    expect(result.sourceType).toBe("freemind");
    expect(result.title).toBe("Root Topic");
    expect(result.sheets).toHaveLength(1);
    expect(result.sheets[0].root.id).toBe("root-1");
    expect(result.sheets[0].root.comment).toBe("Root note");
    expect(result.sheets[0].root.children).toHaveLength(2);
    expect(result.sheets[0].root.children[1].comment).toBe("Child note");
  });

  it("uses richcontent TYPE=NODE when TEXT is missing", async () => {
    const file = createMindmapFile("rich.mm", `<?xml version="1.0"?>
      <map version="1.0.1">
        <node>
          <richcontent TYPE="NODE"><html><body>Rich Root</body></html></richcontent>
        </node>
      </map>`);

    const result = await parseFreeMindFile(file);

    expect(result.sheets[0].root.text).toBe("Rich Root");
  });

  it("creates a virtual root when map has multiple top-level nodes", async () => {
    const file = createMindmapFile("workspace.mm", `<?xml version="1.0"?>
      <map version="1.0.1">
        <node TEXT="Alpha" />
        <node TEXT="Beta" />
      </map>`);

    const result = await parseFreeMindFile(file);

    expect(result.title).toBe("workspace");
    expect(result.sheets[0].root.text).toBe("workspace");
    expect(result.sheets[0].root.children).toHaveLength(2);
  });

  it("does not inherit child notes onto the parent node", async () => {
    const file = createMindmapFile("nested-note.mm", `<?xml version="1.0"?>
      <map version="1.0.1">
        <node TEXT="Parent">
          <node TEXT="Child">
            <richcontent TYPE="NOTE"><html><body>Child only note</body></html></richcontent>
          </node>
        </node>
      </map>`);

    const result = await parseFreeMindFile(file);

    expect(result.sheets[0].root.comment).toBe("");
    expect(result.sheets[0].root.children[0].comment).toBe("Child only note");
  });

  it("rejects FreeMind without valid node content", async () => {
    const file = createMindmapFile("empty.mm", `<?xml version="1.0"?>
      <map version="1.0.1">
        <node />
      </map>`);

    await expect(parseFreeMindFile(file)).rejects.toThrow("FreeMind中没有找到有效node节点");
  });

  it("rejects invalid XML", async () => {
    const file = createMindmapFile("broken.mm", "<map><node TEXT=\"Broken\"></map>");

    await expect(parseFreeMindFile(file)).rejects.toThrow("FreeMind解析失败: XML格式无效");
  });

  it("rejects XML without map root", async () => {
    const file = createMindmapFile("no-map.mm", `<?xml version="1.0"?>
      <root>
        <node TEXT="Broken" />
      </root>`);

    await expect(parseFreeMindFile(file)).rejects.toThrow("FreeMind解析失败: 缺少map根节点");
  });
});
