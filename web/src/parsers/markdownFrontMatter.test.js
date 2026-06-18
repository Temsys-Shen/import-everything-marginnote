import { describe, expect, it } from "vitest";
import { stripMarkdownFrontMatter } from "./markdownFrontMatter";
import { parseMarkdownFile } from "./markdownParser";
import { renderMarkdownToHtml } from "./markdownEngine";

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
    expect(result.sections[0].title).toBe("Visible heading");
    expect(result.sections[0].pageBreakBefore).toBe(true);
    expect(result.sections[0].html).toContain("<h1>Visible heading</h1>");
    expect(result.sections[0].html).toContain("<p>Paragraph</p>");
    expect(result.sections[0].html).not.toContain("Hidden title");
    expect(result.sections[0].html).not.toContain("<hr");
  });

  it("splits multiple h1 sections into separate sections", async () => {
    const file = createTextFile("multi.md", [
      "# Chapter 1",
      "",
      "Content of chapter one.",
      "",
      "# Chapter 2",
      "",
      "Content of chapter two.",
    ].join("\n"));

    const result = await parseMarkdownFile(file);

    expect(result.sections).toHaveLength(2);
    expect(result.sections[0].title).toBe("Chapter 1");
    expect(result.sections[0].html).toContain("Content of chapter one");
    expect(result.sections[1].title).toBe("Chapter 2");
    expect(result.sections[1].html).toContain("Content of chapter two");
    expect(result.sections[0].pageBreakBefore).toBe(true);
    expect(result.sections[1].pageBreakBefore).toBe(true);
  });

  it("uses file name as section title when no heading exists", async () => {
    const file = createTextFile("readme.md", "Just a plain paragraph.\n\nAnother line.");

    const result = await parseMarkdownFile(file);

    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].title).toBe("readme.md");
    expect(result.sections[0].html).toContain("<p>Just a plain paragraph.</p>");
  });

  it("keeps h2-h6 within the same section", async () => {
    const file = createTextFile("nested.md", [
      "# Main title",
      "",
      "Intro text.",
      "",
      "## Sub section",
      "",
      "Sub content.",
    ].join("\n"));

    const result = await parseMarkdownFile(file);

    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].title).toBe("Main title");
    expect(result.sections[0].html).toContain("<h2>Sub section</h2>");
    expect(result.sections[0].html).toContain("<p>Sub content.</p>");
  });

  it("creates intro section for content before first h1", async () => {
    const file = createTextFile("intro.md", [
      "Some preamble text here.",
      "",
      "# First heading",
      "",
      "Body content.",
    ].join("\n"));

    const result = await parseMarkdownFile(file);

    expect(result.sections).toHaveLength(2);
    expect(result.sections[0].title).toBe("intro.md");
    expect(result.sections[0].html).toContain("<p>Some preamble text here.</p>");
    expect(result.sections[1].title).toBe("First heading");
    expect(result.sections[1].html).toContain("<h1>First heading</h1>");
    expect(result.sections[1].html).toContain("<p>Body content.</p>");
  });
});

describe("renderMarkdownToHtml with math blocks", () => {
  it("keeps default katex html and mathml output for preview rendering", () => {
    const html = renderMarkdownToHtml("Inline $E=mc^2$ math.");
    expect(html).toContain("katex-html");
    expect(html).toContain("katex-mathml");
  });

  it("renders $$ block math with closing $$ on same line as content", () => {
    const html = renderMarkdownToHtml([
      "Before",
      "$$",
      "x = 1$$",
      "After",
    ].join("\n"));
    expect(html).toContain("katex");
    expect(html).toContain("Before");
    expect(html).toContain("After");
  });

  it("renders $$ block math with closing $$ on its own line", () => {
    const html = renderMarkdownToHtml([
      "$$",
      "x = 1",
      "$$",
    ].join("\n"));
    expect(html).toContain("katex");
  });

  it("renders inline display math $$...$$ on single line", () => {
    const html = renderMarkdownToHtml("Inline $$x^2$$ math.");
    expect(html).toContain("katex");
  });

  it("renders inline $...$ math", () => {
    const html = renderMarkdownToHtml("Here is $E=mc^2$ inline.");
    expect(html).toContain("katex");
  });

  it("handles math with \\begin{pmatrix} and closing $$ on same line", () => {
    const html = renderMarkdownToHtml([
      "Matrix:",
      "$$",
      "\\begin{pmatrix}",
      " 1 & 0\\\\",
      " 0 & 1",
      "\\end{pmatrix}$$",
      "End.",
    ].join("\n"));
    expect(html).toContain("katex");
  });
});
