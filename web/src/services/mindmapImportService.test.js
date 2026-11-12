import { describe, expect, it, vi } from "vitest";
import MNBridge from "../lib/mnBridge";
import {
  buildImportPayloadTree,
  buildMindmapImportPlan,
  startMindmapImport,
} from "./mindmapImportService";

vi.mock("../lib/mnBridge", () => ({
  default: { send: vi.fn() },
}));

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

describe("buildMindmapImportPlan", () => {
  function createNestedTree() {
    return {
      sourceType: "xmind",
      title: "Nested",
      sheets: [
        {
          id: "sheet-a",
          title: "Sheet A",
          root: {
            id: "root",
            text: "Root",
            children: [
              {
                id: "a1",
                text: "A1",
                children: [
                  { id: "a1-1", text: "A1-1", children: [] },
                ],
              },
              { id: "a2", text: "A2", children: [] },
            ],
          },
        },
        {
          id: "sheet-b",
          title: "Sheet B",
          root: { id: "other", text: "Other", children: [] },
        },
      ],
    };
  }

  it("flattens selected sheets in pre-order with parent indexes", () => {
    const plan = buildMindmapImportPlan(createNestedTree(), ["sheet-a"], {});
    const summary = plan.items.map((item) => ({
      index: item.index,
      parentIndex: item.parentIndex,
      text: item.node.text,
      isLastInSheet: item.isLastInSheet,
    }));

    expect(summary).toEqual([
      { index: 0, parentIndex: null, text: "Root", isLastInSheet: false },
      { index: 1, parentIndex: 0, text: "A1", isLastInSheet: false },
      { index: 2, parentIndex: 1, text: "A1-1", isLastInSheet: false },
      { index: 3, parentIndex: 0, text: "A2", isLastInSheet: true },
    ]);
  });

  it("marks the last node of each selected sheet", () => {
    const plan = buildMindmapImportPlan(createNestedTree(), null, {});
    const lastItems = plan.items.filter((item) => item.isLastInSheet);

    expect(lastItems.map((item) => item.node.text)).toEqual(["A2", "Other"]);
  });

  it("counts image nodes without converting them yet", () => {
    const tree = createNestedTree();
    tree.sheets[0].root.children[0].image = {
      mimeType: "image/png",
      blob: new Blob([new Uint8Array([1])], { type: "image/png" }),
    };

    const plan = buildMindmapImportPlan(tree, ["sheet-a"], {});

    expect(plan.imageTotal).toBe(1);
    expect(plan.items[1].node.image.blob).toBeTruthy();
    expect(plan.items[1].node.image.data).toBeUndefined();
  });
});

describe("startMindmapImport", () => {
  function createWideTree(childCount) {
    const root = { id: "root", text: "Root", children: [] };
    for (let index = 0; index < childCount; index += 1) {
      root.children.push({ id: `child-${index}`, text: `Child ${index}`, children: [] });
    }

    return {
      sourceType: "xmind",
      title: "Wide",
      sheets: [{ id: "sheet-a", title: "Sheet A", root }],
    };
  }

  it("splits the plan into several bridge messages and finishes once", async () => {
    const calls = [];
    MNBridge.send.mockImplementation(async (command, payload) => {
      calls.push({ command, payload });

      if (command === "beginMindmapImport") {
        return { ok: true, data: { taskId: "task-1", phase: "import", current: 0, total: 101 } };
      }
      if (command === "appendMindmapImportBatch") {
        return { ok: true, data: { taskId: "task-1", received: payload.items.length, queued: 0 } };
      }
      return { ok: true, data: { taskId: "task-1" } };
    });

    const startedTasks = [];
    await startMindmapImport(createWideTree(100), ["sheet-a"], {
      onTaskStarted: (taskInfo) => startedTasks.push(taskInfo),
    });

    const appendCalls = calls.filter((call) => call.command === "appendMindmapImportBatch");
    expect(appendCalls.length).toBe(3);
    expect(startedTasks).toHaveLength(1);
    expect(calls[calls.length - 1].command).toBe("finishMindmapImport");

    const sentItems = appendCalls.flatMap((call) => call.payload.items);
    expect(sentItems.map((item) => item.index)).toEqual([...Array(101).keys()]);
    expect(sentItems[0].parentIndex).toBeNull();
    expect(sentItems[100].isLastInSheet).toBe(true);
  });

  it("aborts the native task when a batch fails", async () => {
    const calls = [];
    MNBridge.send.mockImplementation(async (command, payload) => {
      calls.push({ command, payload });

      if (command === "beginMindmapImport") {
        return { ok: true, data: { taskId: "task-2", phase: "import", current: 0, total: 2 } };
      }
      if (command === "appendMindmapImportBatch") {
        return { ok: false, message: "append failed" };
      }
      return { ok: true, data: { taskId: "task-2" } };
    });

    await expect(startMindmapImport(createWideTree(1), ["sheet-a"], {})).rejects.toThrow("append failed");
    expect(calls.some((call) => call.command === "abortMindmapImport")).toBe(true);
  });
});
