import { describe, expect, it } from "vitest";
import { buildImportPayloadTree } from "./mindmapImportService";

function createTree(sourceType = "markdown") {
  return {
    sourceType,
    title: "Demo",
    sheets: [
      {
        id: "sheet-a",
        title: "Sheet A",
        root: {
          id: "root",
          text: "Root",
          comment: "Root body",
          children: [
            {
              id: "child",
              text: "Child",
              comment: "Child body",
              children: [],
            },
          ],
        },
      },
      {
        id: "sheet-b",
        title: "Sheet B",
        root: {
          id: "other",
          text: "Other",
          comment: "Other body",
          children: [],
        },
      },
    ],
  };
}

describe("buildImportPayloadTree", () => {
  it("keeps markdown comments when includeMarkdownContent is enabled", async () => {
    const payload = await buildImportPayloadTree(createTree("markdown"), ["sheet-a"], {
      includeMarkdownContent: true,
    });

    expect(payload.sheets).toHaveLength(1);
    expect(payload.sheets[0].root.comment).toBe("Root body");
    expect(payload.sheets[0].root.children[0].comment).toBe("Child body");
    expect(payload.roots[0]).toBe(payload.sheets[0].root);
  });

  it("strips only markdown comments when includeMarkdownContent is disabled", async () => {
    const payload = await buildImportPayloadTree(createTree("markdown"), ["sheet-a"], {
      includeMarkdownContent: false,
    });

    expect(payload.sheets).toHaveLength(1);
    expect(payload.sheets[0].root.comment).toBe("");
    expect(payload.sheets[0].root.children[0].comment).toBe("");
  });

  it("keeps non-markdown comments even when includeMarkdownContent is disabled", async () => {
    const payload = await buildImportPayloadTree(createTree("xmind"), ["sheet-a"], {
      includeMarkdownContent: false,
    });

    expect(payload.sheets[0].root.comment).toBe("Root body");
    expect(payload.sheets[0].root.children[0].comment).toBe("Child body");
  });

  it("keeps sheet filtering while deriving roots", async () => {
    const payload = await buildImportPayloadTree(createTree("markdown"), ["sheet-b"], {
      includeMarkdownContent: true,
    });

    expect(payload.sheets).toHaveLength(1);
    expect(payload.sheets[0].id).toBe("sheet-b");
    expect(payload.roots).toHaveLength(1);
    expect(payload.roots[0].id).toBe("other");
  });

  it("turns parsed blobs into base64 and reports progress", async () => {
    const tree = createTree("xmind");
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
    tree.sheets[0].root.children[0].image = {
      mimeType: "image/png",
      blob,
      blobUrl: "blob:child-image",
      width: 10,
      height: 10,
    };
    const steps = [];

    const payload = await buildImportPayloadTree(tree, ["sheet-a"], {
      includeMarkdownContent: true,
      onImageProgress: (step) => steps.push(step),
    });

    const image = payload.sheets[0].root.children[0].image;
    expect(image.data).toBe("AQID");
    expect(image.mimeType).toBe("image/png");
    // 预览用的 blob/blobUrl 不进入 payload
    expect(image.blob).toBeUndefined();
    expect(image.blobUrl).toBeUndefined();
    expect(steps).toEqual([{ current: 1, total: 1 }]);
  });

  it("drops images that have neither base64 nor blob", async () => {
    const tree = createTree("xmind");
    tree.sheets[0].root.image = { mimeType: "image/png", width: 4, height: 4 };

    const payload = await buildImportPayloadTree(tree, ["sheet-a"], {});

    expect(payload.sheets[0].root.image).toBeNull();
  });
});
