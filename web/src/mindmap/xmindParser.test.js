import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { parseXmindMindmapFile } from "./xmindParser";

async function createZipFile(name, entries) {
  const zip = new JSZip();
  Object.entries(entries).forEach(([entryName, content]) => {
    zip.file(entryName, content);
  });
  const blob = await zip.generateAsync({ type: "blob" });
  return new File([blob], name);
}

describe("parseXmindMindmapFile", () => {
  it("parses modern JSON xmind files", async () => {
    const file = await createZipFile("modern.xmind", {
      "content.json": JSON.stringify([
        {
          id: "sheet-1",
          title: "Main Sheet",
          rootTopic: {
            id: "root-1",
            title: "Root",
            notes: { plain: { content: "Root note" } },
            children: {
              attached: [
                { id: "child-1", title: "Child", labels: ["A"], markers: [{ markerId: "priority-1" }] },
              ],
            },
          },
        },
      ]),
    });

    const result = await parseXmindMindmapFile(file);

    expect(result.sourceMeta.xmindVariant).toBe("modern-json");
    expect(result.sheets).toHaveLength(1);
    expect(result.sheets[0].root.text).toBe("Root");
    expect(result.sheets[0].root.comment).toBe("Root note");
    expect(result.sheets[0].root.children[0].style.labels).toEqual(["A"]);
    expect(result.sheets[0].root.children[0].style.markers).toEqual(["priority-1"]);
  });

  it("falls back to legacy content.xml xmind files", async () => {
    const file = await createZipFile("legacy.xmind", {
      "content.xml": `<?xml version="1.0" encoding="UTF-8"?>
        <xmap-content>
          <sheet id="sheet-1">
            <title>Legacy Sheet</title>
            <topic id="root-1">
              <title>Root</title>
              <notes><plain>Root note</plain></notes>
              <labels><label>Important</label></labels>
              <marker-refs><marker-ref marker-id="priority-1" /></marker-refs>
              <children>
                <topics type="attached">
                  <topic id="child-1">
                    <title>Child</title>
                  </topic>
                </topics>
              </children>
            </topic>
          </sheet>
        </xmap-content>`,
    });

    const result = await parseXmindMindmapFile(file);

    expect(result.sourceMeta.xmindVariant).toBe("legacy-xml");
    expect(result.sheets).toHaveLength(1);
    expect(result.sheets[0].title).toBe("Legacy Sheet");
    expect(result.sheets[0].root.text).toBe("Root");
    expect(result.sheets[0].root.comment).toBe("Root note");
    expect(result.sheets[0].root.style.labels).toEqual(["Important"]);
    expect(result.sheets[0].root.style.markers).toEqual(["priority-1"]);
    expect(result.sheets[0].root.children[0].text).toBe("Child");
  });

  it("parses multiple legacy sheets", async () => {
    const file = await createZipFile("multi-sheet.xmind", {
      "content.xml": `<?xml version="1.0" encoding="UTF-8"?>
        <xmap-content>
          <sheet id="sheet-1">
            <title>Sheet A</title>
            <topic id="topic-a"><title>A</title></topic>
          </sheet>
          <sheet id="sheet-2">
            <title>Sheet B</title>
            <topic id="topic-b"><title>B</title></topic>
          </sheet>
        </xmap-content>`,
    });

    const result = await parseXmindMindmapFile(file);

    expect(result.sheets).toHaveLength(2);
    expect(result.sheets[0].title).toBe("Sheet A");
    expect(result.sheets[1].title).toBe("Sheet B");
  });

  it("rejects xmind archives without content entries", async () => {
    const file = await createZipFile("broken.xmind", {
      "meta.json": "{}",
    });

    await expect(parseXmindMindmapFile(file)).rejects.toThrow("XMind文件中未找到content.json或content.xml");
  });
});
