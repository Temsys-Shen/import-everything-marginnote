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

  it("parses unordered list items as children of leaf heading by default", async () => {
    const file = createMarkdownFile("list.md", [
      "# Root",
      "- First item",
      "- Second item",
    ].join("\n"));

    const result = await parseMarkdownMindmapFile(file);

    const root = result.sheets[0].root;
    expect(root.children).toHaveLength(2);
    expect(root.children[0].text).toBe("-. First item");
    expect(root.children[1].text).toBe("-. Second item");
  });

  it("parses ordered list with numeric and letter markers, preserving prefixes", async () => {
    const file = createMarkdownFile("ordered.md", [
      "# Steps",
      "1. Step one",
      "2. Step two",
      "a. Sub step a",
      "b. Sub step b",
    ].join("\n"));

    const result = await parseMarkdownMindmapFile(file);

    const root = result.sheets[0].root;
    expect(root.children).toHaveLength(4);
    expect(root.children[0].text).toBe("1. Step one");
    expect(root.children[1].text).toBe("2. Step two");
    expect(root.children[2].text).toBe("a. Sub step a");
    expect(root.children[3].text).toBe("b. Sub step b");
  });

  it("nests sub-lists by indentation", async () => {
    const file = createMarkdownFile("nested.md", [
      "# Root",
      "- Parent",
      "  - Child A",
      "  - Child B",
      "- Sibling",
    ].join("\n"));

    const result = await parseMarkdownMindmapFile(file);

    const root = result.sheets[0].root;
    expect(root.children).toHaveLength(2);
    expect(root.children[0].text).toBe("-. Parent");
    expect(root.children[0].children).toHaveLength(2);
    expect(root.children[0].children[0].text).toBe("-. Child A");
    expect(root.children[0].children[1].text).toBe("-. Child B");
    expect(root.children[1].text).toBe("-. Sibling");
  });

  it("does not treat list as children when heading has deeper sub-headings", async () => {
    const file = createMarkdownFile("non-leaf.md", [
      "# Root",
      "- Item under root",
      "## Child",
      "- Item under child",
    ].join("\n"));

    const result = await parseMarkdownMindmapFile(file);

    const root = result.sheets[0].root;
    // Root is NOT a leaf (has ## Child deeper), so list stays as comment
    expect(root.children).toHaveLength(1);
    expect(root.children[0].text).toBe("Child");
    expect(root.comment).toContain("Item under root");
    // Child IS a leaf, so its list becomes children
    expect(root.children[0].children).toHaveLength(1);
    expect(root.children[0].children[0].text).toBe("-. Item under child");
  });

  it("keeps list as comment when includeListsAsChildren is false", async () => {
    const file = createMarkdownFile("disabled.md", [
      "# Root",
      "- First item",
      "- Second item",
    ].join("\n"));

    const result = await parseMarkdownMindmapFile(file, { includeListsAsChildren: false });

    const root = result.sheets[0].root;
    expect(root.children).toHaveLength(0);
    expect(root.comment).toContain("First item");
    expect(root.comment).toContain("Second item");
  });

  it("treats mixed list markers (asterisk and plus) as children", async () => {
    const file = createMarkdownFile("mixed.md", [
      "# Root",
      "* Asterisk item",
      "+ Plus item",
    ].join("\n"));

    const result = await parseMarkdownMindmapFile(file);

    const root = result.sheets[0].root;
    expect(root.children).toHaveLength(2);
    expect(root.children[0].text).toBe("*. Asterisk item");
    expect(root.children[1].text).toBe("+. Plus item");
  });
});
