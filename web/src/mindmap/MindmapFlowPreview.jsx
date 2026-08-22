import { Handle, Position, ReactFlow, ReactFlowProvider, useReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { renderMarkdownToHtml } from "../parsers/markdownEngine";
import { createMindmapX6Layout } from "./mindmapX6Layout";

const NODE_TYPE = "mindmapNode";
const MIN_SCALE = 0.35;
const MAX_SCALE = 2.2;

function MindmapNodeCard({ data }) {
  const comment = typeof data.comment === "string" ? data.comment.trim() : "";
  const html = comment ? renderMarkdownToHtml(comment) : "";
  const image = data.image;

  return (
    <article className={`mindmap-node-card ${data.isRoot ? "mindmap-node-card-root" : ""}`}>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div className="mindmap-node-title">{data.title}</div>
      {image ? (
        <img className="mindmap-node-image" src={`data:${image.mimeType};base64,${image.data}`} alt="" />
      ) : null}
      {html ? (
        <div
          className="mindmap-node-markdown content-html"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : null}
    </article>
  );
}

const nodeTypes = {
  [NODE_TYPE]: MindmapNodeCard,
};

function MindmapFlowCanvas({ root, includeMarkdownContent = false }) {
  const measureContainerRef = useRef(null);
  const [measureReady, setMeasureReady] = useState(false);
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  const layout = useMemo(() => createMindmapX6Layout(root, {
    includeMarkdownContent,
    measureContainer: measureContainerRef.current,
  }), [includeMarkdownContent, measureReady, root]);

  const nodes = useMemo(() => {
    if (!layout) {
      return [];
    }

    return layout.nodes.map((node) => ({
      id: node.id,
      type: NODE_TYPE,
      position: { x: node.x, y: node.y },
      width: node.width,
      height: node.height,
      data: {
        title: node.title,
        comment: node.comment,
        image: node.image || null,
        isRoot: node.isRoot,
      },
    }));
  }, [layout]);

  const edges = useMemo(() => {
    if (!layout) {
      return [];
    }

    return layout.edges.map((edge) => ({
      id: `edge-${edge.id}`,
      source: edge.source,
      target: edge.target,
      type: "smoothstep",
      style: {
        stroke: "#bfd3c4",
        strokeWidth: 2,
      },
    }));
  }, [layout]);

  useLayoutEffect(() => {
    setMeasureReady(true);
  }, []);

  const fitToView = useCallback(() => {
    fitView({
      padding: 0.1,
      minZoom: MIN_SCALE,
      maxZoom: 1,
      duration: 200,
    });
  }, [fitView]);

  useEffect(() => {
    fitToView();
  }, [fitToView, nodes]);

  useEffect(() => {
    function handleResize() {
      fitToView();
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [fitToView]);

  function zoomBy(factor) {
    const options = { duration: 150 };
    if (factor > 0) {
      zoomIn(options);
    } else {
      zoomOut(options);
    }
  }

  function handleToolbarPointerDown(event) {
    event.stopPropagation();
  }

  return (
    <section className="mindmap-preview-stage">
      <div className="mindmap-canvas-shell mindmap-flow-shell">
        <div className="mindmap-preview-toolbar" onPointerDown={handleToolbarPointerDown}>
          <div className="card-actions">
            <button type="button" className="button button-secondary button-small" onClick={() => zoomBy(-0.1)}>
              缩小
            </button>
            <button type="button" className="button button-secondary button-small" onClick={() => zoomBy(0.1)}>
              放大
            </button>
            <button type="button" className="button button-secondary button-small" onClick={fitToView}>
              自适应
            </button>
          </div>
        </div>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          minZoom={MIN_SCALE}
          maxZoom={MAX_SCALE}
          fitViewOptions={{ padding: 0.1, minZoom: MIN_SCALE, maxZoom: 1 }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          zoomOnDoubleClick={false}
          panOnDrag
          zoomOnScroll
        />
        <div ref={measureContainerRef} className="mindmap-node-measure" aria-hidden="true" />
      </div>
    </section>
  );
}

function MindmapFlowPreview(props) {
  return (
    <ReactFlowProvider>
      <MindmapFlowCanvas {...props} />
    </ReactFlowProvider>
  );
}

export default MindmapFlowPreview;
