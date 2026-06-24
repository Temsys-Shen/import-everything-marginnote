import { Graph } from "@antv/x6";
import { getProvider, register } from "@antv/x6-react-shape";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { renderMarkdownToHtml } from "../parsers/markdownEngine";
import {
  createMindmapX6Layout,
  MINDMAP_X6_MIN_NODE_HEIGHT,
  MINDMAP_X6_NODE_WIDTH,
} from "./mindmapX6Layout";

const NODE_SHAPE = "import-everything-mindmap-node";
const MIN_SCALE = 0.35;
const MAX_SCALE = 2.2;
const FIT_PADDING = 48;

const PortalProvider = getProvider();

function MindmapNodeCard({ node }) {
  const data = node.getData();
  const comment = typeof data.comment === "string" ? data.comment.trim() : "";
  const html = comment ? renderMarkdownToHtml(comment) : "";
  const image = data.image;

  return (
    <article className={`mindmap-node-card ${data.isRoot ? "mindmap-node-card-root" : ""}`}>
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

register({
  shape: NODE_SHAPE,
  width: MINDMAP_X6_NODE_WIDTH,
  height: MINDMAP_X6_MIN_NODE_HEIGHT,
  component: MindmapNodeCard,
});

function buildX6Cells(layout) {
  if (!layout) {
    return [];
  }

  const nodes = layout.nodes.map((node) => ({
    id: node.id,
    shape: NODE_SHAPE,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    data: {
      title: node.title,
      comment: node.comment,
      image: node.image || null,
      isRoot: node.isRoot,
    },
  }));

  const edges = layout.edges.map((edge) => ({
    id: edge.id,
    shape: "edge",
    source: {
      cell: edge.source,
      anchor: {
        name: "right",
      },
    },
    target: {
      cell: edge.target,
      anchor: {
        name: "left",
      },
    },
    vertices: edge.vertices,
    connector: {
      name: "rounded",
      args: {
        radius: 10,
      },
    },
    attrs: {
      line: {
        stroke: "#bfd3c4",
        strokeWidth: 2,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        targetMarker: null,
      },
    },
    zIndex: 0,
  }));

  return [...edges, ...nodes];
}

function MindmapCanvasPreview({ root, includeMarkdownContent = false }) {
  const graphRef = useRef(null);
  const containerRef = useRef(null);
  const measureContainerRef = useRef(null);
  const [measureReady, setMeasureReady] = useState(false);

  const layout = useMemo(() => createMindmapX6Layout(root, {
    includeMarkdownContent,
    measureContainer: measureContainerRef.current,
  }), [includeMarkdownContent, measureReady, root]);

  const fitToView = useCallback(() => {
    const graph = graphRef.current;
    if (!graph || !layout) {
      return;
    }
    graph.zoomToFit({
      padding: FIT_PADDING,
      minScale: MIN_SCALE,
      maxScale: 1,
      useCellGeometry: true,
    });
    graph.centerContent({
      padding: FIT_PADDING,
      useCellGeometry: true,
    });
  }, [layout]);

  useLayoutEffect(() => {
    if (!containerRef.current || graphRef.current) {
      return undefined;
    }

    const graph = new Graph({
      container: containerRef.current,
      autoResize: true,
      background: {
        color: "#f8fbf8",
      },
      interacting: false,
      grid: false,
      panning: {
        enabled: true,
        eventTypes: ["leftMouseDown"],
      },
      mousewheel: {
        enabled: true,
        factor: 1.12,
        minScale: MIN_SCALE,
        maxScale: MAX_SCALE,
        zoomAtMousePosition: true,
      },
      selecting: false,
      connecting: {
        allowBlank: false,
        allowLoop: false,
        allowNode: false,
        allowEdge: false,
      },
    });

    graphRef.current = graph;
    setMeasureReady(true);

    return () => {
      graph.dispose();
      graphRef.current = null;
    };
  }, []);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) {
      return;
    }

    graph.fromJSON({
      cells: buildX6Cells(layout),
    });
    fitToView();
  }, [fitToView, layout]);

  useEffect(() => {
    function handleResize() {
      const graph = graphRef.current;
      if (!graph) {
        return;
      }
      graph.resize();
      fitToView();
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [fitToView]);

  function zoomBy(factor) {
    const graph = graphRef.current;
    if (!graph) {
      return;
    }
    graph.zoom(factor, {
      minScale: MIN_SCALE,
      maxScale: MAX_SCALE,
    });
  }

  function handleToolbarPointerDown(event) {
    event.stopPropagation();
  }

  return (
    <section className="mindmap-preview-stage">
      <div className="mindmap-canvas-shell mindmap-x6-shell">
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
        <div ref={containerRef} className="mindmap-x6-graph" />
        <div ref={measureContainerRef} className="mindmap-node-measure" aria-hidden="true" />
      </div>
      <PortalProvider />
    </section>
  );
}

export default MindmapCanvasPreview;
