const BULLET_RE = /^(\s*)- /;

function isBulletLine(line) {
  return BULLET_RE.test(line);
}

function leadingSpaces(line) {
  const m = line.match(/^(\s+)/);
  return m ? m[1].length : 0;
}

function processBulletBlock(lines, startIndex) {
  const result = [];
  let i = startIndex;
  let lastBulletIndent = null;
  let hadBlank = false;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      hadBlank = true;
      i += 1;
      continue;
    }

    const bm = line.match(BULLET_RE);
    if (bm) {
      const indent = bm[1].length;
      const content = line.slice(bm[0].length).trim();

      if (lastBulletIndent !== null && hadBlank && indent <= lastBulletIndent) {
        result.push("");
      }

      const outputLine = " ".repeat(indent) + "- " + content;
      result.push(outputLine);
      lastBulletIndent = indent;
      hadBlank = false;
      i += 1;
      continue;
    }

    const ls = leadingSpaces(line);
    if (ls > 0 && trimmed) {
      if (result.length > 0) {
        result[result.length - 1] += " " + trimmed;
        hadBlank = false;
        i += 1;
        continue;
      }
    }

    break;
  }

  return { lines: result, nextIndex: i };
}

export function normalizeBulletIndentation(markdown) {
  if (!markdown) return markdown;

  const lines = markdown.split("\n");
  const result = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed && isBulletLine(line)) {
      const blockResult = processBulletBlock(lines, i);
      result.push(...blockResult.lines);
      i = blockResult.nextIndex;
    } else {
      result.push(line);
      i += 1;
    }
  }

  return result.join("\n");
}
