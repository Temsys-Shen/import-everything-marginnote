import { describe, expect, it } from "vitest";
import { parseMarkdownMindmapFile } from "./markdownMindmapParser";

function createMarkdownFile(name, content) {
  return {
    name,
    async text() {
      return content;
    },
  };
}

describe("parseMarkdownMindmapFile", () => {
  it("ignores front matter before headings", async () => {
    const file = createMarkdownFile("outline.md", [
      "---",
      "title: Outline",
      "tags:",
      "  - demo",
      "---",
      "",
      "# Root",
      "Root comment",
      "## Child",
      "Child comment",
    ].join("\n"));

    const result = await parseMarkdownMindmapFile(file);

    expect(result.sheets).toHaveLength(1);
    expect(result.sheets[0].root.text).toBe("Root");
    expect(result.sheets[0].root.comment).toBe("Root comment");
    expect(result.sheets[0].root.children).toHaveLength(1);
    expect(result.sheets[0].root.children[0].text).toBe("Child");
    expect(result.sheets[0].root.children[0].comment).toBe("Child comment");
  });

  it("keeps existing error behavior when markdown has no headings after front matter", async () => {
    const file = createMarkdownFile("invalid.md", [
      "---",
      "title: No heading",
      "---",
      "",
      "plain text only",
    ].join("\n"));

    await expect(parseMarkdownMindmapFile(file)).rejects.toThrow("第1行不是标题");
  });

  it("keeps existing behavior for markdown without front matter", async () => {
    const file = createMarkdownFile("simple.md", [
      "# Root",
      "Body",
      "## Child",
    ].join("\n"));

    const result = await parseMarkdownMindmapFile(file);

    expect(result.sheets).toHaveLength(1);
    expect(result.sheets[0].root.text).toBe("Root");
    expect(result.sheets[0].root.children[0].text).toBe("Child");
  });

  it("merges multiple top-level headings into one markdown mindmap", async () => {
    const file = createMarkdownFile("multi-root.md", [
      "# First",
      "First body",
      "# Second",
      "Second body",
    ].join("\n"));

    const result = await parseMarkdownMindmapFile(file);

    expect(result.sheets).toHaveLength(1);
    expect(result.sheets[0].root.text).toBe("multi-root");
    expect(result.sheets[0].root.children).toHaveLength(2);
    expect(result.sheets[0].root.children[0].text).toBe("First");
    expect(result.sheets[0].root.children[1].text).toBe("Second");
  });
});
