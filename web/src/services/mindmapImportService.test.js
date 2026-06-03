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
  it("keeps markdown comments when includeMarkdownContent is enabled", () => {
    const payload = buildImportPayloadTree(createTree("markdown"), ["sheet-a"], {
      includeMarkdownContent: true,
    });

    expect(payload.sheets).toHaveLength(1);
    expect(payload.sheets[0].root.comment).toBe("Root body");
    expect(payload.sheets[0].root.children[0].comment).toBe("Child body");
    expect(payload.roots[0]).toBe(payload.sheets[0].root);
  });

  it("strips only markdown comments when includeMarkdownContent is disabled", () => {
    const payload = buildImportPayloadTree(createTree("markdown"), ["sheet-a"], {
      includeMarkdownContent: false,
    });

    expect(payload.sheets).toHaveLength(1);
    expect(payload.sheets[0].root.comment).toBe("");
    expect(payload.sheets[0].root.children[0].comment).toBe("");
  });

  it("keeps non-markdown comments even when includeMarkdownContent is disabled", () => {
    const payload = buildImportPayloadTree(createTree("xmind"), ["sheet-a"], {
      includeMarkdownContent: false,
    });

    expect(payload.sheets[0].root.comment).toBe("Root body");
    expect(payload.sheets[0].root.children[0].comment).toBe("Child body");
  });

  it("keeps sheet filtering while deriving roots", () => {
    const payload = buildImportPayloadTree(createTree("markdown"), ["sheet-b"], {
      includeMarkdownContent: true,
    });

    expect(payload.sheets).toHaveLength(1);
    expect(payload.sheets[0].id).toBe("sheet-b");
    expect(payload.roots).toHaveLength(1);
    expect(payload.roots[0].id).toBe("other");
  });
});
