import {
  Controls,
  Handle,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useOnViewportChange,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { renderMarkdownToHtml } from "../parsers/markdownEngine";
import { createMindmapX6Layout, getImageSrc } from "./mindmapX6Layout";

const NODE_TYPE = "mindmapNode";
const MIN_SCALE = 0.35;
// 大图（上万像素高）需要比 0.35 更小的缩放下限才能整图自适应。
const MIN_SCALE_FLOOR = 0.02;
const FIT_PADDING = 0.06;
const MAX_SCALE = 2.2;
// 缩到这么小时节点只有几十像素宽，解码整张图没有意义，用占位块代替。
const IMAGE_LOD_MIN_ZOOM = 0.55;
const NODE_CONTENT_WIDTH = 290;
const IMAGE_PLACEHOLDER_MAX_HEIGHT = 200;

const MindmapPreviewLodContext = createContext({ showImages: true });

function getImagePlaceholderHeight(image) {
  const width = Number(image && image.width) || 0;
  const height = Number(image && image.height) || 0;
  const aspect = width > 0 && height > 0 ? height / width : 0.4;

  return Math.max(24, Math.min(IMAGE_PLACEHOLDER_MAX_HEIGHT, Math.round(NODE_CONTENT_WIDTH * aspect)));
}

function MindmapNodeCard({ data }) {
  const comment = typeof data.comment === "string" ? data.comment.trim() : "";
  const html = comment ? renderMarkdownToHtml(comment) : "";
  const image = data.image;
  const title = typeof data.title === "string" ? data.title.trim() : "";
  const isEmpty = !title && !html && !image;
  const { showImages } = useContext(MindmapPreviewLodContext);

  return (
    <article className={`mindmap-node-card ${data.isRoot ? "mindmap-node-card-root" : ""}`}>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      {title ? <div className="mindmap-node-title">{title}</div> : null}
      {image && showImages ? (
        <img
          className="mindmap-node-image"
          src={getImageSrc(image)}
          loading="lazy"
          decoding="async"
          alt=""
        />
      ) : null}
      {image && !showImages ? (
        <div
          className="mindmap-node-image-placeholder"
          style={{ height: `${getImagePlaceholderHeight(image)}px` }}
          aria-hidden="true"
        />
      ) : null}
      {html ? (
        <div
          className="mindmap-node-markdown content-html"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : null}
      {isEmpty ? <div className="mindmap-node-empty">空节点</div> : null}
    </article>
  );
}

const nodeTypes = {
  [NODE_TYPE]: MindmapNodeCard,
};

function MindmapFlowCanvas({ root, includeMarkdownContent = false }) {
  const measureContainerRef = useRef(null);
  const shellRef = useRef(null);
  const [measureReady, setMeasureReady] = useState(false);
  const [showImages, setShowImages] = useState(false);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const { fitView, getViewport } = useReactFlow();

  const lodValue = useMemo(() => ({ showImages }), [showImages]);

  const updateImageLod = useCallback((zoom) => {
    const next = zoom >= IMAGE_LOD_MIN_ZOOM;
    setShowImages((current) => (current === next ? current : next));
  }, []);

  // 只在跨越阈值时切换，避免每个 viewport 事件都重渲染节点。
  useOnViewportChange({
    onChange: useCallback((viewport) => {
      updateImageLod(viewport.zoom);
    }, [updateImageLod]),
  });

  const layout = useMemo(() => createMindmapX6Layout(root, {
    includeMarkdownContent,
    measureContainer: measureContainerRef.current,
  }), [includeMarkdownContent, measureReady, root]);

  // 画布尺寸用于算“装下整图需要多小的缩放”：380 节点、深度 12 的图远小于
  // 固定下限 0.35 才能看全，所以下限要按图的大小动态放开。
  useLayoutEffect(() => {
    const element = shellRef.current;
    if (!element) {
      return undefined;
    }

    const updateSize = () => {
      const width = element.clientWidth;
      const height = element.clientHeight;
      setContainerSize((current) => (
        current.width === width && current.height === height ? current : { width, height }
      ));
    };

    updateSize();

    if (typeof ResizeObserver === "function") {
      const observer = new ResizeObserver(updateSize);
      observer.observe(element);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  const minZoom = useMemo(() => {
    const layoutWidth = Number(layout && layout.width) || 0;
    const layoutHeight = Number(layout && layout.height) || 0;
    const { width, height } = containerSize;

    if (layoutWidth <= 0 || layoutHeight <= 0 || width <= 0 || height <= 0) {
      return MIN_SCALE;
    }

    const required = Math.min(width / layoutWidth, height / layoutHeight);
    return Math.max(MIN_SCALE_FLOOR, Math.min(MIN_SCALE, required * 0.9));
  }, [containerSize, layout]);

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
    const fitted = fitView({
      padding: FIT_PADDING,
      minZoom,
      maxZoom: 1,
      duration: 200,
    });

    // 动画结束后按真实缩放校准一次，避免缩略状态与视口不一致。
    if (fitted && typeof fitted.then === "function") {
      fitted
        .then(() => updateImageLod(getViewport().zoom))
        .catch(() => updateImageLod(getViewport().zoom));
    } else {
      updateImageLod(getViewport().zoom);
    }
  }, [fitView, getViewport, minZoom, updateImageLod]);

  useEffect(() => {
    fitToView();
  }, [fitToView, nodes, containerSize.width, containerSize.height]);

  useEffect(() => {
    function handleResize() {
      fitToView();
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [fitToView]);

  return (
    <MindmapPreviewLodContext.Provider value={lodValue}>
      <section className="mindmap-preview-stage">
        <div ref={shellRef} className="mindmap-canvas-shell mindmap-flow-shell">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            minZoom={minZoom}
            maxZoom={MAX_SCALE}
            fitViewOptions={{ padding: FIT_PADDING, minZoom, maxZoom: 1 }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            zoomOnDoubleClick={false}
            onlyRenderVisibleElements
            panOnDrag
            zoomOnScroll
            proOptions={{ hideAttribution: true }}
          >
            <Controls
              position="bottom-left"
              orientation="horizontal"
              showInteractive={false}
              fitViewOptions={{ padding: FIT_PADDING, minZoom, maxZoom: 1 }}
            />
            {showImages ? null : (
              <Panel position="top-right" className="mindmap-preview-lod-hint">
                缩略模式 · 放大后显示图片
              </Panel>
            )}
          </ReactFlow>
          <div ref={measureContainerRef} className="mindmap-node-measure" aria-hidden="true" />
        </div>
      </section>
    </MindmapPreviewLodContext.Provider>
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
