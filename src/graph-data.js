import { resolveLinks } from './card.js';

export const nodeValue = node => 2 + Math.sqrt(node.degree);
export const NODE_REL_SIZE = 5;
export function labelRadius(node, viewDepth, pixelFocalLength) {
  const radius = NODE_REL_SIZE * Math.cbrt(nodeValue(node));
  if (viewDepth <= radius) return 0;
  const pixels = radius * pixelFocalLength / viewDepth;
  return pixels >= 11 ? pixels : 0;
}

// The renderer mutates nodes and replaces edge endpoints with node objects.
// Pass it a narrow copy, never the library summaries or the shared edge list.
export function graphDataFor(cards, edges = resolveLinks(cards).edges) {
  const degree = new Map();
  for (const { from, to } of edges) {
    degree.set(from, (degree.get(from) ?? 0) + 1);
    degree.set(to, (degree.get(to) ?? 0) + 1);
  }
  return {
    nodes: cards.map(({ id, term }) => ({ id, term, degree: degree.get(id) ?? 0 })),
    links: edges.map(({ from, to }) => ({ source: from, target: to })),
  };
}
