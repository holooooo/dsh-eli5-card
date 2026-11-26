// Shared wire limits, measured in UTF-16 code units.
export const CONTEXT_SIDE_LIMIT = 450;
export const CONTEXT_QUESTION_LIMIT = 500;
export const EXCLUDED_TEXT = '[hidden], [inert], [aria-hidden="true"], [data-text-interaction-exclude], [data-turn-process-hidden], [data-turn-process-inline], [data-chat-group-part="reasoning"], [data-variant="think"], [contenteditable], [data-message-attachments], button, input, textarea, script, style, .sr-only';
const MESSAGE_ROW = '[data-chat-flow-kind]';
const USER_ROW = ':is([data-chat-flow-kind="user"], [data-chat-flow-kind="steering"])';
const USER_SOURCE = '[data-message-bubble][data-text-interaction-source]';
const BLOCK = 'p, li, div, section, h1, h2, h3, h4, h5, h6, td, th, pre, blockquote';

export function clipContext(text, limit, fromEnd = false) {
  const normalized = text.replace(/\s+/gu, ' ').trim();
  if (normalized.length <= limit) return normalized;
  const clipped = fromEnd ? normalized.slice(1 - limit).trimStart() : normalized.slice(0, limit - 1).trimEnd();
  // A cut can land between the two code units of a single character.
  return fromEnd ? `…${clipped.replace(/^[\uDC00-\uDFFF]/u, '')}` : `${clipped.replace(/[\uD800-\uDBFF]$/u, '')}…`;
}

function* textNodes(root) {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.nodeType === Node.TEXT_NODE) return NodeFilter.FILTER_ACCEPT;
      return node.matches(EXCLUDED_TEXT) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP;
    },
  });
  let node;
  while ((node = walker.nextNode())) yield node;
}

function nearbyText(source, range) {
  let before = '', after = '', lastBlock;
  for (const node of textNodes(source)) {
    const block = node.parentElement?.closest(BLOCK);
    const separator = lastBlock && lastBlock !== block ? ' ' : '';
    lastBlock = block;
    if (range.comparePoint(node, 0) < 0) {
      const prefix = node === range.startContainer ? node.data.slice(0, range.startOffset) : node.data;
      const combined = before + separator + prefix.replace(/\s+/gu, ' ');
      before = combined.length > CONTEXT_SIDE_LIMIT + 1 ? clipContext(combined, CONTEXT_SIDE_LIMIT, true) : combined;
    }
    if (range.comparePoint(node, node.length) > 0) {
      const suffix = node === range.endContainer ? node.data.slice(range.endOffset) : node.data;
      after += separator + suffix.replace(/\s+/gu, ' ');
      if (after.trim().length > CONTEXT_SIDE_LIMIT) break;
    }
  }
  return { before: clipContext(before, CONTEXT_SIDE_LIMIT, true), after: clipContext(after, CONTEXT_SIDE_LIMIT) };
}

function promptText(source) {
  if (source.closest(EXCLUDED_TEXT)) return '';
  // The first child is the user-text renderer; later siblings can be JSON blocks.
  const text = source.firstElementChild;
  if (!text || text.matches(EXCLUDED_TEXT)) return '';
  let prompt = '';
  for (const node of textNodes(text)) {
    prompt += node.data.slice(0, CONTEXT_QUESTION_LIMIT + 1).replace(/\s+/gu, ' ');
    if (prompt.length > CONTEXT_QUESTION_LIMIT) break;
  }
  return clipContext(prompt, CONTEXT_QUESTION_LIMIT);
}

export function messageTextBody(source) {
  if (!source?.isConnected || !source.closest('[data-conversation-session]') || source.closest(EXCLUDED_TEXT)) return null;
  const row = source.closest(MESSAGE_ROW);
  if (row?.getAttribute('data-chat-flow-kind') === 'assistant-step') return source;
  if (row?.matches(USER_ROW) && source.matches(USER_SOURCE)) {
    const body = source.firstElementChild;
    return body && !body.matches(EXCLUDED_TEXT) ? body : null;
  }
  return null;
}

export function isMessageSelection(source, range) {
  const body = messageTextBody(source);
  return Boolean(body?.contains(range.startContainer) && body.contains(range.endContainer)
    && !Array.from(body.querySelectorAll(EXCLUDED_TEXT)).some(element => range.intersectsNode(element)));
}

export function readTurnContext(source, range, session) {
  if (!isMessageSelection(source, range) || source.closest('[data-conversation-session]') !== session) return undefined;
  const row = source.closest(MESSAGE_ROW);
  const kind = row?.getAttribute('data-chat-flow-kind');
  const { before, after } = nearbyText(messageTextBody(source), range);
  let question = '';
  const turn = row?.getAttribute('data-chat-turn');
  if (kind === 'assistant-step' && turn && /^\d+$/u.test(turn)) {
    const inputs = session.querySelectorAll(`${USER_ROW} ${USER_SOURCE}`);
    for (let i = inputs.length - 1; i >= 0; i--) {
      const input = inputs[i];
      const inputRow = input.closest(MESSAGE_ROW);
      if (inputRow?.getAttribute('data-chat-turn') !== turn
        || input.closest('[data-conversation-session]') !== session
        || !(input.compareDocumentPosition(source) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
      question = promptText(input);
      if (question) break;
    }
  }
  return before || after || question ? { before, after, question } : undefined;
}
