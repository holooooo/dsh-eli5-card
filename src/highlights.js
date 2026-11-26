import { EXCLUDED_TEXT, messageTextBody } from './turn-context.js';

const SOURCE = '[data-text-interaction-source]';
const EXCLUDED = `a, pre, .katex, .eli5-root, ${EXCLUDED_TEXT}`;
const BLOCK = /^(?:P|DIV|LI|H[1-6]|TD|TH|BLOCKQUOTE|SECTION|ARTICLE|FIGCAPTION|TR|UL|OL)$/u;
const HIGHLIGHT = 'dsh-eli5-terms';

export function attachHighlights(matcher, onOpen) {
  if (!globalThis.CSS?.highlights || !globalThis.Highlight) return () => {};
  if (!matcher.active) return () => {};
  const highlight = new Highlight();
  const sources = new Map();
  const hits = new WeakMap();
  const pending = new Set();
  let frame = 0;
  CSS.highlights.set(HIGHLIGHT, highlight);

  function drop(source) {
    const entry = sources.get(source);
    if (!entry) return;
    for (const range of entry.ranges) highlight.delete(range);
    for (const node of entry.nodes) hits.delete(node);
    sources.delete(source);
  }

  function scan(source) {
    drop(source);
    const body = source.matches(SOURCE) && !source.closest(EXCLUDED) ? messageTextBody(source) : null;
    if (!body) return;
    const entry = { ranges: [], nodes: new Set() };
    const nodes = [];
    let text = '';
    function flush() {
      let first = 0;
      for (const match of matcher.ranges(text)) {
        while (first < nodes.length && nodes[first].end <= match.start) first++;
        let last = first;
        while (last < nodes.length && nodes[last].end < match.end) last++;
        if (!nodes[first] || !nodes[last]) continue;
        const start = nodes[first];
        const finish = nodes[last];
        const range = document.createRange();
        range.setStart(start.node, match.start - start.start);
        range.setEnd(finish.node, match.end - finish.start);
        highlight.add(range);
        entry.ranges.push(range);
        for (let i = first; i <= last; i++) {
          const { node, start: base, end } = nodes[i];
          let list = hits.get(node);
          if (!list) { list = []; hits.set(node, list); }
          list.push({ start: Math.max(0, match.start - base), end: Math.min(end - base, match.end - base), range, id: match.id });
          entry.nodes.add(node);
        }
      }
      nodes.length = 0;
      text = '';
    }
    function visit(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.data.length) { nodes.push({ node, start: text.length, end: text.length + node.data.length }); text += node.data; }
        return;
      }
      if (!(node instanceof Element)) return;
      if (node !== body && (node.matches(EXCLUDED) || node.matches(SOURCE) || node.tagName === 'BR')) { flush(); return; }
      const boundary = node !== body && BLOCK.test(node.tagName);
      if (boundary) flush();
      for (const child of node.childNodes) visit(child);
      if (boundary) flush();
    }
    visit(body);
    flush();
    if (entry.ranges.length) sources.set(source, entry);
  }

  const containing = node => (node instanceof Element ? node : node.parentElement)?.closest(SOURCE);
  function enqueue(node, discover) {
    if (sources.has(node)) pending.add(node);
    const parent = containing(node);
    if (parent) pending.add(parent);
    if (discover && node instanceof Element) {
      for (const source of node.querySelectorAll(SOURCE)) pending.add(source);
    }
  }
  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      for (const source of sources.keys()) if (!source.isConnected) drop(source);
      for (const source of pending) scan(source);
      pending.clear();
    });
  }
  for (const source of document.querySelectorAll(SOURCE)) pending.add(source);
  schedule();
  const observer = new MutationObserver(records => {
    let removed = false;
    for (const record of records) {
      enqueue(record.target, record.type === 'attributes');
      for (const node of record.addedNodes) enqueue(node, true);
      removed ||= record.removedNodes.length !== 0;
    }
    if (pending.size || removed) schedule();
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true,
    attributeFilter: ['data-text-interaction-source', 'data-text-interaction-exclude', 'data-chat-flow-kind',
      'data-chat-group-part', 'data-turn-process-hidden', 'data-turn-process-inline', 'hidden', 'inert', 'aria-hidden'] });

  function hit(event) {
    if (!(event.target instanceof Element) || !event.target.closest(SOURCE) || event.target.closest(EXCLUDED)) return;
    const point = document.caretPositionFromPoint?.(event.clientX, event.clientY);
    const legacy = point ?? document.caretRangeFromPoint?.(event.clientX, event.clientY);
    const list = legacy && hits.get(point ? point.offsetNode : legacy.startContainer);
    const offset = point ? point.offset : legacy?.startOffset;
    for (const match of list ?? []) {
      if (offset < match.start || offset > match.end) continue;
      for (const rect of match.range.getClientRects()) {
        if (event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom) return { id: match.id, rect };
      }
    }
  }
  function clicked(event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || !document.getSelection()?.isCollapsed) return;
    const match = hit(event);
    if (match) onOpen(match.id, match.rect);
  }
  document.addEventListener('click', clicked, true);
  return () => {
    observer.disconnect();
    if (frame) cancelAnimationFrame(frame);
    document.removeEventListener('click', clicked, true);
    if (CSS.highlights.get(HIGHLIGHT) === highlight) CSS.highlights.delete(HIGHLIGHT);
  };
}
