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

// 匹配列表行：无序(- * +) / 有序数字(1.) / 字母(a. b. A. B.) / 罗马数字(i. ii.)
// 支持前导空格（缩进），捕获 marker（含尾部点和空格）与 content。
const LIST_LINE_RE = /^(\s*)([-*+]|\d+[.)]|[ivxlcdmIVXLCDM]+[.)]|[a-zA-Z][.)])\s+(.*)$/;

function isListLine(line) {
  return LIST_LINE_RE.test(line);
}

function formatListItemText(marker, content) {
  // marker 可能是 "-" / "*" / "+" / "1." / "1)" / "a." / "i)" 等
  // 若 marker 已含标点后缀（. 或 )），直接拼接；否则补一个 "."
  const hasPunctSuffix = /[.)]$/.test(marker);
  return `${hasPunctSuffix ? marker : `${marker}.`} ${content}`.trim();
}

function parseListBlock(lines, startIndex, baseLine) {
  // 解析连续列表行（可含空行分隔的同级列表延续），返回 children 列表和结束索引
  const items = [];
  let i = startIndex;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      // 空行：检查下一非空行是否仍是列表且缩进 >= baseLine，若是则继续，否则结束
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) {
        j += 1;
      }
      if (j < lines.length && isListLine(lines[j])) {
        const nextIndent = lines[j].match(LIST_LINE_RE)[1].length;
        if (nextIndent >= baseLine) {
          i = j;
          continue;
        }
      }
      break;
    }

    const match = line.match(LIST_LINE_RE);
    if (!match) {
      break;
    }

    const indent = match[1].length;
    const marker = match[2];
    const content = match[3].trim();

    if (indent < baseLine) {
      break;
    }

    const node = createMindmapImportNode({
      text: formatListItemText(marker, content),
      children: [],
      sourceMeta: {
        line: i + 1,
        syntax: "markdown-list-item",
        marker,
        indent,
      },
    });

    // 收集子列表（缩进更深的连续行）
    const sub = collectChildList(lines, i + 1, indent);
    if (sub.children.length > 0) {
      node.children.push(...sub.children);
    }
    i = sub.nextIndex;

    // 合并紧随其后的非列表续行（续行缩进 > baseLine 且非列表）
    while (i < lines.length) {
      const nextLine = lines[i];
      const nextTrimmed = nextLine.trim();
      if (!nextTrimmed) {
        break;
      }
      if (isListLine(nextLine)) {
        break;
      }
      const nextIndentMatch = nextLine.match(/^(\s*)/);
      const nextIndent = nextIndentMatch ? nextIndentMatch[1].length : 0;
      if (nextIndent <= baseLine) {
        break;
      }
      // 续行：追加到节点 comment
      node.comment = node.comment
        ? `${node.comment}${node.comment.endsWith("\n\n") ? "" : "\n"}${nextTrimmed}`
        : nextTrimmed;
      i += 1;
    }

    items.push(node);
  }

  return { children: items, nextIndex: i };
}

function collectChildList(lines, startIndex, parentIndent) {
  // 向前看，跳过空行，找到第一个缩进 > parentIndent 的列表行作为子列表起点
  let i = startIndex;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (!isListLine(line)) {
      break;
    }

    const match = line.match(LIST_LINE_RE);
    const indent = match[1].length;
    if (indent <= parentIndent) {
      break;
    }

    // 找到子列表起点
    return parseListBlock(lines, i, indent);
  }
  return { children: [], nextIndex: startIndex };
}

export async function parseMarkdownMindmapFile(file, options = {}) {
  const includeListsAsChildren = options.includeListsAsChildren !== false;
  const rawText = await file.text();
  const normalized = stripMarkdownFrontMatter(rawText);
  const markdown = normalized.content;
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const roots = [];
  const headingStack = [];
  let currentNode = null;
  let encounteredHeading = false;

  function currentDepth() {
    return headingStack.length > 0 ? headingStack[headingStack.length - 1].depth : 0;
  }

  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) {
      if (currentNode && currentNode.comment) {
        currentNode.comment += "\n\n";
      }
      index += 1;
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
      index += 1;
      continue;
    }

    if (!encounteredHeading) {
      throw new Error(`第${index + 1}行不是标题。Markdown脑图仅支持标题层级语法。`);
    }

    if (!currentNode) {
      throw new Error(`第${index + 1}行正文缺少对应标题`);
    }

    // 列表处理：当开启且当前节点是叶子（栈顶深度 == 当前节点深度，即没有更深的子标题压入）
    if (includeListsAsChildren && isListLine(line)) {
      const match = line.match(LIST_LINE_RE);
      const baseIndent = match[1].length;

      // 判定是否为叶子节点：从当前位置向后扫描，遇到下一个标题时，
      // 如果该标题深度 <= currentDepth()，则当前节点是叶子（其后无更深层标题）
      const isLeaf = checkIsLeafHeading(lines, index, currentDepth());

      if (isLeaf) {
        const result = parseListBlock(lines, index, baseIndent);
        if (result.children.length > 0) {
          currentNode.children.push(...result.children);
          index = result.nextIndex;
          continue;
        }
      }
    }

    currentNode.comment = currentNode.comment
      ? `${currentNode.comment}${currentNode.comment.endsWith("\n\n") ? "" : "\n"}${trimmed}`
      : trimmed;
    index += 1;
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
        syntax: includeListsAsChildren ? "headings-and-lists" : "headings-only",
      },
    })],
    sourceMeta: {
      fileName: file.name,
      syntax: includeListsAsChildren ? "headings-and-lists" : "headings-only",
    },
  });
}

function checkIsLeafHeading(lines, startIndex, currentDepthValue) {
  // 从 startIndex 向后扫描，遇到第一个标题行：
  // - 若其 depth <= currentDepthValue，说明当前节点之后没有更深的标题，当前节点是叶子
  // - 若其 depth > currentDepthValue，说明有更深的子标题，当前节点不是叶子
  for (let i = startIndex; i < lines.length; i += 1) {
    const line = lines[i];
    const headingMatch = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (headingMatch) {
      const depth = headingMatch[1].length;
      return depth <= currentDepthValue;
    }
  }
  return true;
}
