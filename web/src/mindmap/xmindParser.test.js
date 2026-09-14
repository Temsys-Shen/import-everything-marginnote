import JSZip from "jszip";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseXmindMindmapFile } from "./xmindParser";
import { visitMindmapNodes } from "./model";

const ONE_PX_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const ONE_PX_PNG_BYTES = Buffer.from(ONE_PX_PNG_BASE64, "base64");

// jsdom never decodes data-URI images, so resolve dimensions synchronously.
class InstantImage {
  constructor() {
    this.naturalWidth = 120;
    this.naturalHeight = 60;
    this.onload = null;
    this.onerror = null;
    this._src = "";
  }

  set src(value) {
    this._src = value;
    if (typeof this.onload === "function") {
      this.onload();
    }
  }

  get src() {
    return this._src;
  }
}

// jsdom 不实现 URL.createObjectURL，图片现在以 blob URL 形式产出。
let restoreObjectUrls = null;

function stubObjectUrls() {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = vi.fn(() => "blob:test-image");
  URL.revokeObjectURL = vi.fn();
  restoreObjectUrls = () => {
    if (originalCreate) {
      URL.createObjectURL = originalCreate;
    } else {
      delete URL.createObjectURL;
    }
    if (originalRevoke) {
      URL.revokeObjectURL = originalRevoke;
    } else {
      delete URL.revokeObjectURL;
    }
  };
}

function collectNodes(root) {
  const nodes = [];
  visitMindmapNodes(root, (node) => {
    nodes.push(node);
  });
  return nodes;
}

function createDeepImageSheet(imageSrc) {
  let topic = { id: "img-deep", image: { src: imageSrc, width: 100, height: 40 } };
  for (let depth = 0; depth < 5; depth += 1) {
    topic = {
      id: `level-${5 - depth}`,
      title: `Level ${5 - depth}`,
      children: { attached: [topic] },
    };
  }

  return {
    id: "sheet-1",
    class: "sheet",
    title: "画布 1",
    rootTopic: {
      id: "root-1",
      title: "Root",
      children: { attached: [topic] },
    },
  };
}

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

describe("parseXmindMindmapFile images and empty titles", () => {
  afterEach(() => {
    if (restoreObjectUrls) {
      restoreObjectUrls();
      restoreObjectUrls = null;
    }
    vi.unstubAllGlobals();
  });

  it("keeps images on deep image-only topics without inventing a title", async () => {
    vi.stubGlobal("Image", InstantImage);
    stubObjectUrls();
    const file = await createZipFile("deep-image.xmind", {
      "content.json": JSON.stringify([createDeepImageSheet("xap:resources/x.png")]),
      "resources/x.png": ONE_PX_PNG_BYTES,
    });

    const result = await parseXmindMindmapFile(file);
    const nodes = collectNodes(result.sheets[0].root);
    const imageNode = nodes.find((node) => node.id === "img-deep");

    expect(imageNode).toBeTruthy();
    expect(imageNode.text).toBe("");
    expect(imageNode.image).toBeTruthy();
    expect(imageNode.image.mimeType).toBe("image/png");
    expect(imageNode.image.blob).toBeInstanceOf(Blob);
    expect(imageNode.image.blobUrl).toBe("blob:test-image");
    // base64 推迟到导入时才生成
    expect(imageNode.image.data).toBeUndefined();
    expect(nodes.some((node) => node.text === "(无标题)")).toBe(false);
  });

  it("resolves URL-encoded resource paths", async () => {
    vi.stubGlobal("Image", InstantImage);
    stubObjectUrls();
    const file = await createZipFile("encoded.xmind", {
      "content.json": JSON.stringify([createDeepImageSheet("xap:resources/%E5%9B%BE.png")]),
      "resources/图.png": ONE_PX_PNG_BYTES,
    });

    const result = await parseXmindMindmapFile(file);
    const imageNode = collectNodes(result.sheets[0].root).find((node) => node.id === "img-deep");

    expect(imageNode.image).toBeTruthy();
    expect(imageNode.image.blobUrl).toBe("blob:test-image");
  });

  it("accepts inline base64 image sources", async () => {
    vi.stubGlobal("Image", InstantImage);
    stubObjectUrls();
    const file = await createZipFile("inline.xmind", {
      "content.json": JSON.stringify([
        createDeepImageSheet(`data:image/png;base64,${ONE_PX_PNG_BASE64}`),
      ]),
    });

    const result = await parseXmindMindmapFile(file);
    const imageNode = collectNodes(result.sheets[0].root).find((node) => node.id === "img-deep");

    expect(imageNode.image).toBeTruthy();
    expect(imageNode.image.blobUrl).toBe("blob:test-image");
  });

  it("resolves topics referenced by id even when they are defined deep in the file", async () => {
    vi.stubGlobal("Image", InstantImage);
    const file = await createZipFile("id-ref.xmind", {
      "content.json": JSON.stringify([
        {
          id: "sheet-1",
          class: "sheet",
          title: "画布 1",
          rootTopic: {
            id: "root-1",
            title: "Root",
            children: { attached: ["deep-topic-id"] },
            catalog: {
              l1: {
                l2: {
                  l3: {
                    l4: {
                      l5: [{ id: "deep-topic-id", title: "深层主题", image: { src: "xap:resources/x.png" } }],
                    },
                  },
                },
              },
            },
          },
        },
      ]),
      "resources/x.png": ONE_PX_PNG_BYTES,
    });

    const result = await parseXmindMindmapFile(file);
    const node = collectNodes(result.sheets[0].root).find((item) => item.id === "deep-topic-id");

    expect(node).toBeTruthy();
    expect(node.text).toBe("深层主题");
    expect(node.image).toBeTruthy();
  });

  it("keeps empty-title topics when the sheet root has no title", async () => {
    vi.stubGlobal("Image", InstantImage);
    const file = await createZipFile("untitled-root.xmind", {
      "content.json": JSON.stringify([
        {
          id: "sheet-1",
          class: "sheet",
          title: "画布 1",
          rootTopic: { id: "root-1", image: { src: "xap:resources/x.png" } },
        },
      ]),
      "resources/x.png": ONE_PX_PNG_BYTES,
    });

    const result = await parseXmindMindmapFile(file);

    expect(result.sheets).toHaveLength(1);
    expect(result.sheets[0].root.text).toBe("");
    expect(result.sheets[0].root.image).toBeTruthy();
  });

  it("reports parse progress down to image extraction", async () => {
    vi.stubGlobal("Image", InstantImage);
    const file = await createZipFile("progress.xmind", {
      "content.json": JSON.stringify([
        {
          id: "sheet-1",
          class: "sheet",
          title: "画布 1",
          rootTopic: {
            id: "root-1",
            title: "Root",
            children: {
              attached: [
                { id: "img-a", image: { src: "xap:resources/a.png" } },
                { id: "img-b", image: { src: "xap:resources/b.png" } },
              ],
            },
          },
        },
      ]),
      "resources/a.png": ONE_PX_PNG_BYTES,
      "resources/b.png": ONE_PX_PNG_BYTES,
    });

    const phases = [];
    const result = await parseXmindMindmapFile(file, {
      onProgress: (progress) => phases.push(progress),
    });

    const phaseNames = phases.map((item) => item.phase);
    expect(phaseNames[0]).toBe("read");
    expect(phaseNames).toContain("structure");
    expect(phaseNames[phaseNames.length - 1]).toBe("done");

    const imageSteps = phases.filter((item) => item.phase === "images");
    expect(imageSteps).toHaveLength(3);
    expect(imageSteps.map((item) => item.current)).toEqual([0, 1, 2]);
    expect(imageSteps.every((item) => item.total === 2)).toBe(true);
    expect(imageSteps[0].message).toContain("0/2");
    expect(imageSteps[2].message).toContain("2/2");

    expect(collectNodes(result.sheets[0].root).filter((node) => node.image)).toHaveLength(2);
  });

  it("uses the image size recorded by XMind instead of decoding pixels", async () => {
    // 故意不 stub Image：这条路径若去解码像素就会卡到超时并拿到 0x0。
    stubObjectUrls();
    const file = await createZipFile("sized.xmind", {
      "content.json": JSON.stringify([
        {
          id: "sheet-1",
          class: "sheet",
          title: "画布 1",
          rootTopic: {
            id: "root-1",
            title: "Root",
            children: {
              attached: [
                { id: "img-sized", image: { src: "xap:resources/x.png", width: 240, height: 96 } },
              ],
            },
          },
        },
      ]),
      "resources/x.png": ONE_PX_PNG_BYTES,
    });

    const result = await parseXmindMindmapFile(file);
    const node = collectNodes(result.sheets[0].root).find((item) => item.id === "img-sized");

    expect(node.image).toBeTruthy();
    expect(node.image.blob).toBeInstanceOf(Blob);
    expect(node.image.width).toBe(240);
    expect(node.image.height).toBe(96);
  });
});
