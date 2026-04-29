import { describe, expect, it } from "vitest";
import { parseOpmlMindmapFile } from "./opmlParser";

function createOpmlFile(name, content) {
  return {
    name,
    async text() {
      return content;
    },
  };
}

describe("parseOpmlMindmapFile", () => {
  it("parses a single-root OPML tree", async () => {
    const file = createOpmlFile("outline.opml", `<?xml version="1.0"?>
      <opml version="2.0">
        <head>
          <title>Outline Tree</title>
        </head>
        <body>
          <outline text="Root" _note="Root note">
            <outline text="Child 1" />
            <outline text="Child 2">
              <outline text="Grandchild" note="Nested note" />
            </outline>
          </outline>
        </body>
      </opml>`);

    const result = await parseOpmlMindmapFile(file);

    expect(result.sourceType).toBe("opml");
    expect(result.title).toBe("Outline Tree");
    expect(result.sheets).toHaveLength(1);
    expect(result.sheets[0].root.text).toBe("Root");
    expect(result.sheets[0].root.comment).toBe("Root note");
    expect(result.sheets[0].root.children).toHaveLength(2);
    expect(result.sheets[0].root.children[1].children[0].text).toBe("Grandchild");
    expect(result.sheets[0].root.children[1].children[0].comment).toBe("Nested note");
  });

  it("creates a virtual root when multiple top-level outlines exist", async () => {
    const file = createOpmlFile("multi-root.opml", `<?xml version="1.0"?>
      <opml version="2.0">
        <head><title>Workspace Map</title></head>
        <body>
          <outline text="Alpha" />
          <outline text="Beta" />
        </body>
      </opml>`);

    const result = await parseOpmlMindmapFile(file);

    expect(result.sheets[0].root.text).toBe("Workspace Map");
    expect(result.sheets[0].root.children).toHaveLength(2);
    expect(result.sheets[0].root.children[0].text).toBe("Alpha");
    expect(result.sheets[0].root.children[1].text).toBe("Beta");
  });

  it("falls back to the file name when head title is missing", async () => {
    const file = createOpmlFile("project-outline.opml", `<?xml version="1.0"?>
      <opml version="2.0">
        <body>
          <outline text="Root" />
          <outline text="Second" />
        </body>
      </opml>`);

    const result = await parseOpmlMindmapFile(file);

    expect(result.title).toBe("project-outline");
    expect(result.sheets[0].root.text).toBe("project-outline");
  });

  it("uses title attribute when text is missing", async () => {
    const file = createOpmlFile("title-only.opml", `<?xml version="1.0"?>
      <opml version="2.0">
        <body>
          <outline title="Title Node" />
        </body>
      </opml>`);

    const result = await parseOpmlMindmapFile(file);

    expect(result.sheets[0].root.text).toBe("Title Node");
  });

  it("rejects OPML without valid outline nodes", async () => {
    const file = createOpmlFile("empty.opml", `<?xml version="1.0"?>
      <opml version="2.0">
        <body>
          <outline />
        </body>
      </opml>`);

    await expect(parseOpmlMindmapFile(file)).rejects.toThrow("OPML中没有找到有效outline节点");
  });

  it("rejects invalid XML", async () => {
    const file = createOpmlFile("broken.opml", "<opml><body><outline text=\"Broken\"></body></opml>");

    await expect(parseOpmlMindmapFile(file)).rejects.toThrow("OPML解析失败: XML格式无效");
  });

  it("rejects OPML without body", async () => {
    const file = createOpmlFile("no-body.opml", `<?xml version="1.0"?>
      <opml version="2.0">
        <head><title>No Body</title></head>
      </opml>`);

    await expect(parseOpmlMindmapFile(file)).rejects.toThrow("OPML解析失败: 缺少body节点");
  });
});
