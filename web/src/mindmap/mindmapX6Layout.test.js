import { describe, expect, it } from "vitest";
import { createMindmapX6Layout } from "./mindmapX6Layout";

function createRoot() {
  return {
    id: "root",
    text: "这是一个非常长的中文标题，用来验证节点固定宽度时不会被横向压缩而是交给HTML自然换行",
    comment: [
      "这是一段Markdown正文。",
      "",
      "- 第一条列表内容",
      "- 第二条列表内容",
      "",
      "> 引用内容",
    ].join("\n"),
    children: [
      {
        id: "child-a",
        text: "Child A",
        comment: "Child body",
        children: [],
      },
      {
        id: "child-b",
        text: "Child B",
        comment: "",
        children: [
          {
            id: "grandchild",
            text: "Grandchild",
            comment: "Nested body",
            children: [],
          },
        ],
      },
    ],
  };
}

describe("createMindmapX6Layout", () => {
  it("returns stable node sizes and coordinates for long markdown content", () => {
    const layout = createMindmapX6Layout(createRoot(), {
      includeMarkdownContent: true,
    });

    expect(layout.nodes).toHaveLength(4);
    expect(layout.edges).toHaveLength(3);
    expect(layout.width).toBeGreaterThan(320);
    expect(layout.height).toBeGreaterThan(0);

    const root = layout.nodes.find((node) => node.id === "root");
    const child = layout.nodes.find((node) => node.id === "child-a");

    expect(root.width).toBe(320);
    expect(root.height).toBeGreaterThan(52);
    expect(child.x).toBeGreaterThan(root.x);
    expect(child.y).toBeGreaterThanOrEqual(0);

    const rootToChild = layout.edges.find((edge) => edge.source === "root" && edge.target === "child-a");
    expect(rootToChild.vertices).toHaveLength(2);
    expect(rootToChild.vertices[0].y).toBe(root.y + (root.height / 2));
    expect(rootToChild.vertices[1].y).toBe(child.y + (child.height / 2));
    expect(rootToChild.vertices[0].x).toBe(rootToChild.vertices[1].x);
  });

  it("removes markdown content height when includeMarkdownContent is disabled", () => {
    const withContent = createMindmapX6Layout(createRoot(), {
      includeMarkdownContent: true,
    });
    const withoutContent = createMindmapX6Layout(createRoot(), {
      includeMarkdownContent: false,
    });

    const rootWithContent = withContent.nodes.find((node) => node.id === "root");
    const rootWithoutContent = withoutContent.nodes.find((node) => node.id === "root");

    expect(rootWithContent.comment).toContain("Markdown正文");
    expect(rootWithoutContent.comment).toBe("");
    expect(rootWithoutContent.height).toBeLessThan(rootWithContent.height);
  });
});
