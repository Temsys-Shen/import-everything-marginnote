import parseFrontMatter from "front-matter";

export function stripMarkdownFrontMatter(markdown) {
  const source = String(markdown || "");
  const parsed = parseFrontMatter(source);
  const hasFrontMatter = Object.keys(parsed.attributes || {}).length > 0
    || parsed.frontmatter !== undefined;
  const content = hasFrontMatter
    ? String(parsed.body || "").replace(/^\r?\n/, "")
    : String(parsed.body || "");

  return {
    content,
    data: parsed.attributes || {},
    hasFrontMatter,
    language: "yaml",
  };
}
