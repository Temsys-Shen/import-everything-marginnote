import { renderMarkdownToHtml } from "../parsers/markdownEngine";

export const MINDMAP_X6_NODE_WIDTH = 320;
export const MINDMAP_X6_MIN_NODE_HEIGHT = 52;
export const MINDMAP_X6_IMAGE_MAX_HEIGHT = 200;
const CARD_PADDING_LR = 30;
const IMAGE_MARGIN_BOTTOM = 10;

const LEVEL_GAP_X = 88;
const SIBLING_GAP_Y = 28;

function getNodeTitle(topic) {
  return String(topic && topic.text ? topic.text : "").trim() || "(无标题)";
}

function getNodeComment(topic, includeMarkdownContent) {
  if (!includeMarkdownContent) {
    return "";
  }
  return typeof (topic && topic.comment) === "string" ? topic.comment.trim() : "";
}

function getNodeImage(topic) {
  if (!topic || !topic.image || typeof topic.image !== "object") return null;
  if (typeof topic.image.data === "string" && typeof topic.image.mimeType === "string") {
    return topic.image;
  }
  return null;
}

function createNodeHtml(title, comment, isRoot, image) {
  const safeTitle = title
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
  const commentHtml = comment ? renderMarkdownToHtml(comment) : "";
  const imageHtml = image
    ? `<img class="mindmap-node-image" src="data:${image.mimeType};base64,${image.data}" alt="" />`
    : "";
  return [
    `<article class="mindmap-node-card ${isRoot ? "mindmap-node-card-root" : ""}">`,
    `<div class="mindmap-node-title">${safeTitle}</div>`,
    imageHtml,
    commentHtml ? `<div class="mindmap-node-markdown content-html">${commentHtml}</div>` : "",
    "</article>",
  ].join("");
}

function getRenderedImageHeight(image) {
  if (!image || !image.width || !image.height) return MINDMAP_X6_IMAGE_MAX_HEIGHT;
  const containerWidth = MINDMAP_X6_NODE_WIDTH - CARD_PADDING_LR;
  const scale = Math.min(containerWidth / image.width, MINDMAP_X6_IMAGE_MAX_HEIGHT / image.height, 1);
  return Math.round(image.height * scale);
}

function estimateNodeHeight(topic, includeMarkdownContent) {
  const title = getNodeTitle(topic);
  const comment = getNodeComment(topic, includeMarkdownContent);
  const image = getNodeImage(topic);
  const titleLines = Math.max(1, Math.ceil(title.length / 19));
  const commentLines = comment ? Math.max(1, Math.ceil(comment.length / 28)) : 0;
  const titleHeight = 22 + ((titleLines - 1) * 20);
  const commentHeight = commentLines > 0 ? 14 + (commentLines * 20) : 0;
  const imageHeight = image ? getRenderedImageHeight(image) + IMAGE_MARGIN_BOTTOM : 0;
  return Math.max(MINDMAP_X6_MIN_NODE_HEIGHT, Math.ceil(26 + imageHeight + titleHeight + commentHeight));
}

export function measureMindmapNodeSize(topic, options = {}) {
  const width = Number(options.nodeWidth || MINDMAP_X6_NODE_WIDTH);
  const includeMarkdownContent = options.includeMarkdownContent !== false;
  const measureContainer = options.measureContainer || null;
  const title = getNodeTitle(topic);
  const comment = getNodeComment(topic, includeMarkdownContent);
  const image = getNodeImage(topic);

  if (!measureContainer) {
    return {
      width,
      height: estimateNodeHeight(topic, includeMarkdownContent),
    };
  }

  if (image) {
    return { width, height: estimateNodeHeight(topic, includeMarkdownContent) };
  }

  const probe = document.createElement("div");
  probe.className = "mindmap-node-measure-probe";
  probe.style.width = `${width}px`;
  probe.innerHTML = createNodeHtml(title, comment, options.isRoot === true, null);
  measureContainer.appendChild(probe);
  const height = Math.max(MINDMAP_X6_MIN_NODE_HEIGHT, Math.ceil(probe.scrollHeight));
  measureContainer.removeChild(probe);

  return { width, height };
}

function buildInternalTree(topic, options, depth = 0) {
  const children = Array.isArray(topic && topic.children) ? topic.children : [];
  const size = measureMindmapNodeSize(topic, {
    ...options,
    isRoot: depth === 0,
  });
  return {
    id: String(topic && topic.id ? topic.id : `mindmap-node-${depth}-${getNodeTitle(topic)}`),
    topic,
    title: getNodeTitle(topic),
    comment: getNodeComment(topic, options.includeMarkdownContent !== false),
    image: getNodeImage(topic),
    width: size.width,
    height: size.height,
    depth,
    children: children.map((child) => buildInternalTree(child, options, depth + 1)),
    subtreeHeight: size.height,
  };
}

function computeSubtreeHeights(node) {
  if (node.children.length === 0) {
    node.subtreeHeight = node.height;
    return node.subtreeHeight;
  }

  const childHeights = node.children.map(computeSubtreeHeights);
  const stackedHeight = childHeights.reduce((sum, height) => sum + height, 0)
    + (SIBLING_GAP_Y * (childHeights.length - 1));
  node.subtreeHeight = Math.max(node.height, stackedHeight);
  return node.subtreeHeight;
}

function createEdgeVertices(parent, child) {
  const sourceX = parent.x + parent.width;
  const sourceY = parent.y + (parent.height / 2);
  const targetX = child.x;
  const targetY = child.y + (child.height / 2);
  const midX = sourceX + ((targetX - sourceX) / 2);

  return [
    {
      x: midX,
      y: sourceY,
    },
    {
      x: midX,
      y: targetY,
    },
  ];
}

function assignChildPositions(node, left, top, nodes, edges) {
  const x = left;
  let y = top + ((node.subtreeHeight - node.height) / 2);
  const childLayouts = [];

  if (node.children.length > 0) {
    let cursorY = top;
    const childCenters = [];
    node.children.forEach((child) => {
      const childLeft = left + node.width + LEVEL_GAP_X;
      const childLayout = assignChildPositions(child, childLeft, cursorY, nodes, edges);
      childLayouts.push(childLayout);
      childCenters.push(childLayout.y + (childLayout.height / 2));
      cursorY += child.subtreeHeight + SIBLING_GAP_Y;
    });

    if (childCenters.length > 0) {
      y = childCenters.reduce((sum, value) => sum + value, 0) / childCenters.length - (node.height / 2);
    }
  }

  const layoutNode = {
    id: node.id,
    title: node.title,
    comment: node.comment,
    image: node.image,
    x,
    y,
    width: node.width,
    height: node.height,
    depth: node.depth,
    isRoot: node.depth === 0,
  };

  nodes.push(layoutNode);
  childLayouts.forEach((childLayout) => {
    edges.push({
      id: `edge-${node.id}-${childLayout.id}`,
      source: node.id,
      target: childLayout.id,
      vertices: createEdgeVertices(layoutNode, childLayout),
    });
  });

  return layoutNode;
}

function computeLayoutBounds(nodes) {
  if (nodes.length === 0) {
    return {
      minX: 0,
      maxX: 1,
      minY: 0,
      maxY: 1,
    };
  }

  return nodes.reduce((bounds, node) => ({
    minX: Math.min(bounds.minX, node.x),
    maxX: Math.max(bounds.maxX, node.x + node.width),
    minY: Math.min(bounds.minY, node.y),
    maxY: Math.max(bounds.maxY, node.y + node.height),
  }), {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
  });
}

export function createMindmapX6Layout(rootTopic, options = {}) {
  if (!rootTopic) {
    return null;
  }

  const root = buildInternalTree(rootTopic, {
    nodeWidth: Number(options.nodeWidth || MINDMAP_X6_NODE_WIDTH),
    includeMarkdownContent: options.includeMarkdownContent !== false,
    measureContainer: options.measureContainer || null,
  });
  computeSubtreeHeights(root);

  const nodes = [];
  const edges = [];
  assignChildPositions(root, 0, 0, nodes, edges);
  const bounds = computeLayoutBounds(nodes);

  return {
    nodes,
    edges,
    bounds,
    width: Math.max(1, bounds.maxX - bounds.minX),
    height: Math.max(1, bounds.maxY - bounds.minY),
  };
}
