import { createMindmapImportNode, createMindmapImportSheet, createMindmapImportTree } from "./model";
import { stripMarkdownFrontMatter } from "../parsers/markdownFrontMatter";

function isHeadingLine(line) {
  return /^(#{1,6})\s+(.+?)\s*$/.test(line);
}

function buildMarkdownMindmapRoot(validRoots, fileName) {
  if (validRoots.length === 1) {
    return validRoots[0];
  }

  const title = String(fileName || "").replace(/\.[^.]+$/, "").trim() || "Markdown脑图";
  return createMindmapImportNode({
    text: title,
    children: validRoots,
    sourceMeta: {
      syntax: "markdown-virtual-root",
    },
  });
}

export async function parseMarkdownMindmapFile(file) {
  const rawText = await file.text();
  const normalized = stripMarkdownFrontMatter(rawText);
  const markdown = normalized.content;
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const roots = [];
  const headingStack = [];
  let currentNode = null;
  let encounteredHeading = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) {
      if (currentNode && currentNode.comment) {
        currentNode.comment += "\n\n";
      }
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (headingMatch) {
      encounteredHeading = true;
      const depth = headingMatch[1].length;
      const text = headingMatch[2].trim();
      if (!text) {
        throw new Error(`第${index + 1}行标题为空`);
      }

      const node = createMindmapImportNode({
        text,
        children: [],
        sourceMeta: {
          line: index + 1,
          syntax: "markdown-heading",
          depth,
        },
      });

      while (headingStack.length > 0 && headingStack[headingStack.length - 1].depth >= depth) {
        headingStack.pop();
      }

      if (headingStack.length === 0) {
        roots.push(node);
      } else {
        headingStack[headingStack.length - 1].node.children.push(node);
      }

      headingStack.push({ depth, node });
      currentNode = node;
      continue;
    }

    if (!encounteredHeading) {
      throw new Error(`第${index + 1}行不是标题。Markdown脑图仅支持标题层级语法。`);
    }

    if (!currentNode) {
      throw new Error(`第${index + 1}行正文缺少对应标题`);
    }

    currentNode.comment = currentNode.comment
      ? `${currentNode.comment}${currentNode.comment.endsWith("\n\n") ? "" : "\n"}${trimmed}`
      : trimmed;
  }

  const validRoots = roots.filter((node) => node.text);
  if (validRoots.length === 0) {
    const hasHeading = lines.some(isHeadingLine);
    throw new Error(hasHeading ? "Markdown未生成有效节点" : "Markdown中没有找到标题，无法建立脑图");
  }

  const treeTitle = file.name.replace(/\.[^.]+$/, "") || "Markdown脑图";
  const root = buildMarkdownMindmapRoot(validRoots, treeTitle);

  return createMindmapImportTree({
    sourceType: "markdown",
    title: treeTitle,
    sheets: [createMindmapImportSheet({
      id: "markdown-root",
      title: root.text || treeTitle,
      root,
      sourceMeta: {
        syntax: "headings-only",
      },
    })],
    sourceMeta: {
      fileName: file.name,
      syntax: "headings-only",
    },
  });
}
