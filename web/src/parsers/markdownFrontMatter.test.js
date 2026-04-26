import { describe, expect, it } from "vitest";
import { stripMarkdownFrontMatter } from "./markdownFrontMatter";
import { parseMarkdownFile } from "./markdownParser";

function createTextFile(name, content) {
  return {
    name,
    async text() {
      return content;
    },
  };
}

describe("stripMarkdownFrontMatter", () => {
  it("removes yaml front matter and keeps markdown body", () => {
    const markdown = [
      "---",
      "title: Example",
      "tags:",
      "  - one",
      "  - two",
      "---",
      "",
      "# Heading",
      "",
      "Body",
    ].join("\n");

    const result = stripMarkdownFrontMatter(markdown);

    expect(result.hasFrontMatter).toBe(true);
    expect(result.content).toBe("# Heading\n\nBody");
  });

  it("leaves markdown unchanged when there is no front matter", () => {
    const markdown = "# Heading\n\nBody";

    const result = stripMarkdownFrontMatter(markdown);

    expect(result.hasFrontMatter).toBe(false);
    expect(result.content).toBe(markdown);
  });

  it("does not treat yaml-like code blocks as front matter", () => {
    const markdown = [
      "```yaml",
      "---",
      "title: Inside code block",
      "---",
      "```",
      "",
      "# Heading",
    ].join("\n");

    const result = stripMarkdownFrontMatter(markdown);

    expect(result.hasFrontMatter).toBe(false);
    expect(result.content).toBe(markdown);
  });

  it("removes empty and comment-only front matter", () => {
    const markdown = [
      "---",
      "# comment",
      "---",
      "",
      "# Heading",
    ].join("\n");

    const result = stripMarkdownFrontMatter(markdown);

    expect(result.hasFrontMatter).toBe(true);
    expect(result.content).toBe("# Heading");
  });

  it("throws when front matter yaml is invalid", () => {
    const markdown = [
      "---",
      "title: [unterminated",
      "---",
      "",
      "# Heading",
    ].join("\n");

    expect(() => stripMarkdownFrontMatter(markdown)).toThrow();
  });
});

describe("parseMarkdownFile", () => {
  it("renders markdown without front matter content", async () => {
    const file = createTextFile("example.md", [
      "---",
      "title: Hidden title",
      "---",
      "",
      "# Visible heading",
      "",
      "Paragraph",
    ].join("\n"));

    const result = await parseMarkdownFile(file);

    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].html).toContain("<h1>Visible heading</h1>");
    expect(result.sections[0].html).toContain("<p>Paragraph</p>");
    expect(result.sections[0].html).not.toContain("Hidden title");
    expect(result.sections[0].html).not.toContain("<hr");
  });
});

