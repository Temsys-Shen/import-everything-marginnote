import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const NODE_HEIGHT = 40;
const NODE_RADIUS = 12;
const LEVEL_GAP_X = 42;
const SIBLING_GAP_Y = 18;
const COLLAPSE_MARKER_RADIUS = 7;
const MIN_SCALE = 0.35;
const MAX_SCALE = 2.2;

function clampScale(value) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

function measureNodeWidth(context, title) {
  const text = String(title || "").trim() || "(无标题)";
  return Math.max(96, Math.min(260, Math.ceil(context.measureText(text).width + 40)));
}

function buildInternalTree(topic, context) {
  const children = Array.isArray(topic && topic.children) ? topic.children : [];
  const title = String(topic && topic.text ? topic.text : "").trim() || "(无标题)";
  return {
    id: String(topic && topic.id ? topic.id : title),
    title,
    width: measureNodeWidth(context, title),
    height: NODE_HEIGHT,
    children: children.map((child) => buildInternalTree(child, context)),
    subtreeHeight: NODE_HEIGHT,
  };
}

function computeSubtreeHeights(node) {
  if (node.children.length === 0) {
    node.subtreeHeight = node.height;
    return node.subtreeHeight;
  }

  const childHeights = node.children.map(computeSubtreeHeights);
  const stackedHeight = childHeights.reduce((sum, height) => sum + height, 0) + (SIBLING_GAP_Y * (childHeights.length - 1));
  node.subtreeHeight = Math.max(node.height, stackedHeight);
  return node.subtreeHeight;
}

function assignHorizontalPositions(node, parentX, parentWidth, subtreeTopY, nodes, parentId) {
  const x = parentX + (parentWidth / 2) + LEVEL_GAP_X + (node.width / 2);
  let y = subtreeTopY + (node.height / 2);

  if (node.children.length > 0) {
    let cursorY = subtreeTopY;
    const childPositions = [];
    node.children.forEach((child) => {
      assignHorizontalPositions(child, x, node.width, cursorY, nodes, node.id);
      const childNode = nodes.find((item) => item.id === child.id);
      if (childNode) {
        childPositions.push(childNode.y);
      }
      cursorY += child.subtreeHeight + SIBLING_GAP_Y;
    });

    if (childPositions.length > 0) {
      y = (childPositions[0] + childPositions[childPositions.length - 1]) / 2;
    }
  }

  nodes.push({
    id: node.id,
    title: node.title,
    x,
    y,
    width: node.width,
    height: node.height,
    parentId,
  });
}

function computeLayoutBounds(nodes) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  nodes.forEach((node) => {
    minX = Math.min(minX, node.x - (node.width / 2));
    maxX = Math.max(maxX, node.x + (node.width / 2) + COLLAPSE_MARKER_RADIUS + 12);
    minY = Math.min(minY, node.y - (node.height / 2));
    maxY = Math.max(maxY, node.y + (node.height / 2));
  });

  return { minX, maxX, minY, maxY };
}

function createLayout(rootTopic) {
  if (!rootTopic) {
    return null;
  }

  const measureCanvas = document.createElement("canvas");
  const measureContext = measureCanvas.getContext("2d");
  if (!measureContext) {
    return null;
  }
  measureContext.font = "14px Avenir Next, PingFang SC, sans-serif";

  const root = buildInternalTree(rootTopic, measureContext);
  computeSubtreeHeights(root);

  const nodes = [{
    id: root.id,
    title: root.title,
    x: 0,
    y: 0,
    width: root.width,
    height: root.height,
    parentId: null,
  }];

  const totalHeight = root.children.reduce((sum, child) => sum + child.subtreeHeight, 0) + (Math.max(0, root.children.length - 1) * SIBLING_GAP_Y);
  let cursorY = -(totalHeight / 2);
  root.children.forEach((child) => {
    assignHorizontalPositions(child, 0, root.width, cursorY, nodes, root.id);
    cursorY += child.subtreeHeight + SIBLING_GAP_Y;
  });

  const bounds = computeLayoutBounds(nodes);
  return {
    nodes,
    bounds,
    width: Math.max(1, bounds.maxX - bounds.minX),
    height: Math.max(1, bounds.maxY - bounds.minY),
  };
}

function getConnectorEndpoints(parent, node) {
  return {
    fromX: parent.x + (parent.width / 2),
    fromY: parent.y,
    toX: node.x - (node.width / 2),
    toY: node.y,
  };
}

function drawRoundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function fitViewToLayout(layout, rect) {
  const scale = clampScale(Math.min((rect.width - 72) / layout.width, (rect.height - 72) / layout.height, 1));
  const width = layout.width * scale;
  const height = layout.height * scale;
  return {
    scale,
    offsetX: ((rect.width - width) / 2) - (layout.bounds.minX * scale),
    offsetY: ((rect.height - height) / 2) - (layout.bounds.minY * scale),
  };
}

function drawConnectorPath(context, fromX, fromY, toX, toY) {
  const dx = toX - fromX;
  context.beginPath();
  context.moveTo(fromX, fromY);
  context.bezierCurveTo(fromX + (dx * 0.5), fromY, toX - (dx * 0.5), toY, toX, toY);
  context.stroke();
}

function MindmapCanvasPreview({ root }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const dragStateRef = useRef({
    dragging: false,
    pointerId: null,
    startClientX: 0,
    startClientY: 0,
    startOffsetX: 0,
    startOffsetY: 0,
  });
  const viewRef = useRef({
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  });
  const [isDragging, setIsDragging] = useState(false);
  const layout = useMemo(() => createLayout(root), [root]);

  const syncCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) {
      return null;
    }

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    return { width: rect.width, height: rect.height, dpr };
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const size = syncCanvasSize();
    if (!canvas || !size) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    context.clearRect(0, 0, size.width, size.height);
    context.fillStyle = "#f8fbf8";
    context.fillRect(0, 0, size.width, size.height);

    if (!layout) {
      return;
    }

    const byId = new Map(layout.nodes.map((node) => [node.id, node]));
    const view = viewRef.current;

    context.save();
    context.translate(view.offsetX, view.offsetY);
    context.scale(view.scale, view.scale);

    context.lineWidth = 2;
    context.strokeStyle = "#bfd3c4";
    layout.nodes.forEach((node) => {
      if (!node.parentId) {
        return;
      }
      const parent = byId.get(node.parentId);
      if (!parent) {
        return;
      }
      const { fromX, fromY, toX, toY } = getConnectorEndpoints(parent, node);
      drawConnectorPath(context, fromX, fromY, toX, toY);
    });

    context.font = "14px Avenir Next, PingFang SC, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";

    layout.nodes.forEach((node) => {
      const left = node.x - (node.width / 2);
      const top = node.y - (node.height / 2);
      drawRoundedRect(context, left, top, node.width, node.height, NODE_RADIUS);
      context.fillStyle = node.parentId === null ? "#1f6a49" : "#ffffff";
      context.fill();
      context.lineWidth = node.parentId === null ? 2.5 : 1.5;
      context.strokeStyle = node.parentId === null ? "#19543a" : "#cfd8d1";
      context.stroke();

      context.fillStyle = node.parentId === null ? "#ffffff" : "#182018";
      context.fillText(node.title, node.x, node.y, node.width - 24);
    });

    context.restore();
  }, [layout, syncCanvasSize]);

  const fitToView = useCallback(() => {
    const container = containerRef.current;
    if (!layout || !container) {
      return;
    }
    viewRef.current = fitViewToLayout(layout, container.getBoundingClientRect());
    draw();
  }, [draw, layout]);

  useEffect(() => {
    fitToView();
  }, [fitToView]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    function handleResize() {
      fitToView();
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [fitToView]);

  function zoomFromCenter(factor) {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const rect = container.getBoundingClientRect();
    const previous = viewRef.current;
    const scale = clampScale(previous.scale * factor);
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const worldX = (centerX - previous.offsetX) / previous.scale;
    const worldY = (centerY - previous.offsetY) / previous.scale;
    viewRef.current = {
      scale,
      offsetX: centerX - (worldX * scale),
      offsetY: centerY - (worldY * scale),
    };
    draw();
  }

  function endDrag() {
    dragStateRef.current = {
      dragging: false,
      pointerId: null,
      startClientX: 0,
      startClientY: 0,
      startOffsetX: 0,
      startOffsetY: 0,
    };
    setIsDragging(false);
  }

  function handlePointerDown(event) {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }
    if (!layout) {
      return;
    }

    const currentView = viewRef.current;
    dragStateRef.current = {
      dragging: true,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startOffsetX: currentView.offsetX,
      startOffsetY: currentView.offsetY,
    };
    setIsDragging(true);
    if (event.currentTarget && event.currentTarget.setPointerCapture) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }

  function handlePointerMove(event) {
    const dragState = dragStateRef.current;
    if (!dragState.dragging || dragState.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - dragState.startClientX;
    const deltaY = event.clientY - dragState.startClientY;
    viewRef.current = {
      ...viewRef.current,
      offsetX: dragState.startOffsetX + deltaX,
      offsetY: dragState.startOffsetY + deltaY,
    };
    draw();
  }

  function handlePointerUp(event) {
    const dragState = dragStateRef.current;
    if (dragState.pointerId !== event.pointerId) {
      return;
    }
    if (event.currentTarget && event.currentTarget.releasePointerCapture && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    endDrag();
  }

  function handlePointerCancel(event) {
    const dragState = dragStateRef.current;
    if (dragState.pointerId !== event.pointerId) {
      return;
    }
    endDrag();
  }

  function handleToolbarPointerDown(event) {
    event.stopPropagation();
  }

  return (
    <section className="mindmap-preview-stage">
      <div
        className="mindmap-canvas-shell"
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        <div className="mindmap-preview-toolbar" onPointerDown={handleToolbarPointerDown}>
          <div className="card-actions">
            <button type="button" className="button button-secondary button-small" onClick={() => zoomFromCenter(0.9)}>
              缩小
            </button>
            <button type="button" className="button button-secondary button-small" onClick={() => zoomFromCenter(1.1)}>
              放大
            </button>
            <button type="button" className="button button-secondary button-small" onClick={fitToView}>
              自适应
            </button>
          </div>
        </div>
        <canvas
          ref={canvasRef}
          className={`mindmap-canvas ${isDragging ? "mindmap-canvas-dragging" : ""}`}
        />
      </div>
    </section>
  );
}

export default MindmapCanvasPreview;
