import { graphDataFor, labelRadius, NODE_REL_SIZE, nodeValue } from './graph-data.js';

// Screen-space labels are independent of raycasting and don't become 3D hit targets.
function mountLabels(host, graph, nodes, Vector3, isVisible) {
  const layer = document.createElement('canvas');
  layer.className = 'eli5-node-labels';
  layer.setAttribute('aria-hidden', 'true');
  host.append(layer);
  const ctx = layer.getContext('2d');
  if (!ctx) return () => layer.remove();
  const view = new Vector3(), projected = new Vector3();
  let previous = 0, width = 0, height = 0, dpr = 0, colors, frame;
  function themeColors(time) {
    const style = getComputedStyle(host);
    return { time, ink: style.color, halo: style.backgroundColor };
  }
  const draw = time => {
    frame = requestAnimationFrame(draw);
    if (time - previous < 32 || !isVisible() || document.hidden || !host.clientHeight) return;
    previous = time;
    const w = host.clientWidth, h = host.clientHeight, scale = Math.min(devicePixelRatio || 1, 2);
    if (width !== w || height !== h || dpr !== scale) {
      width = w; height = h; dpr = scale;
      layer.width = Math.round(w * scale); layer.height = Math.round(h * scale);
    }
    if (!colors || time - colors.time > 500) colors = themeColors(time);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.font = '500 13px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
    ctx.fillStyle = colors.ink; ctx.strokeStyle = colors.halo;
    const camera = graph.camera();
    const focalLength = h * camera.projectionMatrix.elements[5] / 2;
    const labels = [];
    for (const node of nodes) {
      if (!Number.isFinite(node.x)) continue;
      view.set(node.x, node.y, node.z).applyMatrix4(camera.matrixWorldInverse);
      const radius = labelRadius(node, -view.z, focalLength);
      if (!radius) continue;
      projected.copy(view).applyMatrix4(camera.projectionMatrix);
      if (Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1 || Math.abs(projected.z) > 1) continue;
      const x = (projected.x + 1) * w / 2, y = (1 - projected.y) * h / 2 + radius + 5;
      if (y + 16 <= h) labels.push({ x, y, radius, name: node.term });
    }
    // Favor nearby/large nodes when labels would overlap.
    const shown = [];
    labels.sort((a, b) => b.radius - a.radius);
    for (const { x, y, name } of labels) {
      const half = Math.min(ctx.measureText(name).width, 180) / 2 + 4;
      if (shown.some(a => Math.abs(a.y - y) < 18 && Math.abs(a.x - x) < a.half + half)) continue;
      shown.push({ x, y, half });
      ctx.strokeText(name, x, y, 180); ctx.fillText(name, x, y, 180);
    }
  };
  frame = requestAnimationFrame(draw);
  return () => { cancelAnimationFrame(frame); layer.remove(); };
}

// Keep Three/WebGL initialization out of the chat and settings paths.
export async function mountForceGraph(host, { cards, edges, onOpen, onHover, onFailure, signal }) {
  const [{ default: ForceGraph }, { Vector3 }] = await Promise.all([import('3d-force-graph'), import('three')]);
  signal.throwIfAborted();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let graph, resize, visibility, renderer, unmountLabels;
  const data = graphDataFor(cards, edges);
  let disposed = false;
  let visible = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener('abort', dispose);
    resize?.disconnect();
    visibility?.disconnect();
    unmountLabels?.();
    document.removeEventListener('visibilitychange', updateAnimation);
    host.removeEventListener('pointerleave', leave);
    renderer?.domElement.removeEventListener('webglcontextlost', loseContext);
    // The pinned graph version disposes its controls, scene and renderer here.
    try { graph?._destructor(); }
    finally {
      try { renderer?.forceContextLoss(); }
      finally { host.replaceChildren(); }
    }
  };
  function leave() { onHover(null); }
  function loseContext(event) { event.preventDefault(); leave(); dispose(); onFailure(); }
  function updateAnimation() {
    if (visible && !document.hidden) graph?.resumeAnimation();
    else { graph?.pauseAnimation(); onHover(null); }
  }
  try {
    graph = new ForceGraph(host, { controlType: 'orbit', rendererConfig: { alpha: true, antialias: true } });
    renderer = graph.renderer();
    const size = () => {
      if (host.clientWidth && host.clientHeight) graph.width(host.clientWidth).height(host.clientHeight);
    };
    const anchor = node => {
      const point = graph.graph2ScreenCoords(node.x, node.y, node.z);
      const { left, top } = host.getBoundingClientRect();
      return { left: left + point.x, top: top + point.y, bottom: top + point.y };
    };
    const anchorForEvent = (node, event) => event?.detail > 0 && Number.isFinite(event.clientX)
      ? { left: event.clientX, top: event.clientY, bottom: event.clientY } : anchor(node);
    graph.backgroundColor('rgba(0,0,0,0)').showNavInfo(false).nodeLabel('').linkLabel('')
      .nodeVal(nodeValue).nodeRelSize(NODE_REL_SIZE).nodeResolution(12)
      .nodeColor(node => node.degree ? '#4f83e0' : '#7d92ad').nodeOpacity(0.92)
      .linkColor(() => '#6b87ad').linkOpacity(0.55).enableNodeDrag(false)
      .warmupTicks(reducedMotion ? 100 : 35).cooldownTicks(reducedMotion ? 0 : 110)
      .onNodeHover(node => onHover(node?.id ?? null, node && anchor(node)))
      .onNodeClick((node, event) => onOpen(node.id, anchorForEvent(node, event)))
      .onEngineStop(() => { if (data.nodes.length) graph.zoomToFit(reducedMotion ? 0 : 320, 36); })
      .graphData(data);
    if (data.nodes.length) unmountLabels = mountLabels(host, graph, data.nodes, Vector3, () => visible);
    size();
    resize = new ResizeObserver(size);
    resize.observe(host);
    visibility = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; updateAnimation(); });
    visibility.observe(host);
    renderer.domElement.addEventListener('webglcontextlost', loseContext);
    host.addEventListener('pointerleave', leave);
    document.addEventListener('visibilitychange', updateAnimation);
    signal.addEventListener('abort', dispose, { once: true });
  } catch (error) {
    dispose();
    throw error;
  }
}
