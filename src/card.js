export const MAX_TERM = 100;
export const PALETTE = ['ink', 'blue', 'sky', 'gold', 'sand', 'white'];
export const COLORS = { ink: '#152946', blue: '#2258be', sky: '#b7d9ff', gold: '#bb591b', sand: '#ffe0aa', white: '#ffffff' };

export const cleanTerm = value => typeof value === 'string' ? value.trim().replace(/\s+/gu, ' ') : '';
export const validTerm = value => value.length > 0 && value.length <= MAX_TERM && /[\p{L}\p{N}]/u.test(value);
export const termKey = value => cleanTerm(value).normalize('NFKC').toLowerCase();

export function resolveLinks(cards) {
  const alias = new Map();
  for (const card of cards) alias.set(termKey(card.term), card.id);
  for (const card of cards) for (const name of card.aliases) {
    if (!alias.has(termKey(name))) alias.set(termKey(name), card.id);
  }
  const edges = new Map();
  for (const card of cards) for (const link of card.related) {
    const target = alias.get(termKey(link.term));
    if (!target || target === card.id) continue;
    const key = [card.id, target].sort().join(':');
    if (!edges.has(key)) edges.set(key, { from: card.id, to: target, reason: link.reason });
  }
  return { alias, edges: [...edges.values()] };
}

export const escapeText = value => String(value).replace(/[&<>"']/gu, mark => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[mark]);

export function svgFor(visual) {
  const body = visual.shapes.map(shape => {
    const color = COLORS[shape.color] ?? COLORS.ink;
    switch (shape.kind) {
      case 'box': return `<rect x="${shape.x}" y="${shape.y}" width="${shape.w}" height="${shape.h}" rx="13" fill="${color}"/>`;
      case 'circle': return `<circle cx="${shape.x}" cy="${shape.y}" r="${shape.r}" fill="${color}"/>`;
      case 'line': return `<line x1="${shape.x}" y1="${shape.y}" x2="${shape.x2}" y2="${shape.y2}" stroke="${color}" stroke-width="5" stroke-linecap="round"${shape.arrow ? ' marker-end="url(#eli5-arrow)"' : ''}/>`;
      case 'symbol': return `<text x="${shape.x}" y="${shape.y}" text-anchor="middle" dominant-baseline="central" font-size="${shape.size}" fill="${color}">${escapeText(shape.text)}</text>`;
      case 'label': return `<text x="${shape.x}" y="${shape.y}" text-anchor="middle" dominant-baseline="central" font-size="16" font-weight="650" fill="${color}">${escapeText(shape.text)}</text>`;
      default: return '';
    }
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="280" viewBox="0 0 520 280" role="img" font-family="system-ui,sans-serif"><title>${escapeText(visual.alt)}</title><defs><marker id="eli5-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0L10 5 0 10Z" fill="#2258be"/></marker><pattern id="eli5-grid" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#b8c9e3" opacity=".62"/></pattern></defs><rect width="520" height="280" rx="18" fill="#eaf2ff"/><rect width="520" height="280" rx="18" fill="url(#eli5-grid)"/>${body}</svg>`;
}

const yq = JSON.stringify;
export function markdownFor(card) {
  const { id, term, title, summary, aliases, tags, related, route, createdAt, language, sourceSessionId } = card;
  return `---\nschema: eli5-card/v1\nid: ${yq(id)}\nterm: ${yq(term)}\ntitle: ${yq(title)}\naliases: ${yq(aliases)}\ntags: ${yq(tags)}\nrelated: ${yq(related)}\nprovider: ${yq(route.provider)}\nmodel: ${yq(route.model)}\n${sourceSessionId ? `sourceSessionId: ${yq(sourceSessionId)}\n` : ''}createdAt: ${yq(createdAt)}\n---\n\n# ${title.replace(/([\\#*_`\[\]<>])/gu, '\\$1')}\n\n${summary}\n\n${language === 'zh' ? '类比' : 'Analogy'}：${card.analogy}\n\n${language === 'zh' ? '配图' : 'Illustration'}：${card.visual.alt}\n`;
}

export function artifactHtml(card) {
  const e = escapeText;
  return `<!doctype html><html lang="${card.language === 'zh' ? 'zh-CN' : 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>${e(card.title)}</title><style>body{margin:0;background:#f8fafc;color:#152946;font:17px/1.6 system-ui,sans-serif}main{max-width:680px;margin:5vh auto;padding:24px}header{font-size:13px;letter-spacing:.12em;color:#2258be}h1{font-size:clamp(30px,6vw,56px);line-height:1.1;margin:12px 0 24px;overflow-wrap:anywhere}figure{margin:0}svg{width:100%;height:auto}p{max-width:55ch}aside{border-left:3px solid #2258be;padding-left:14px}</style></head><body><main><header>ELI5</header><h1>${e(card.title)}</h1><figure>${svgFor(card.visual)}</figure><p>${e(card.summary)}</p><aside>${e(card.analogy)}</aside></main></body></html>`;
}

// Uses the public GenUI fence vocabulary so this can be reused by dsh-genui
// without coupling to that plugin's private React context or DOM observer.
export function genuiFence(card) {
  return '```dsh-ui\n' + JSON.stringify({ title: card.title, items: [
    { type: 'svg', title: card.visual.alt, height: 280, code: svgFor(card.visual) },
    { type: 'text', size: 'body', content: card.summary },
    { type: 'callout', tone: 'info', title: card.language === 'zh' ? '打个比方' : 'An analogy', content: card.analogy },
  ] }, null, 2) + '\n```';
}
