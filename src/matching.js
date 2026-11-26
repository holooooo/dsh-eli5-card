// Match full Latin/number tokens and Chinese terms as substrings; avoid a
// global regex whose size grows with the number of saved explanations.
import { cleanTerm, termKey } from './card.js';
const word = /[\p{Script=Latin}\p{N}_]/u;
const before = (text, offset) => offset > 0 ? [...text.slice(Math.max(0, offset - 2), offset)].at(-1) : '';
const after = (text, offset) => offset < text.length ? String.fromCodePoint(text.codePointAt(offset)) : '';

export function makeMatcher(rows) {
  const root = new Map();
  const end = Symbol('term');
  // Canonical terms win over aliases; the newest record wins alias collisions.
  const add = (value, row) => {
    const key = termKey(value);
    if (key === '') return;
    let branch = root;
    for (const unit of key) {
      if (!branch.has(unit)) branch.set(unit, new Map());
      branch = branch.get(unit);
    }
    if (!branch.has(end)) branch.set(end, { id: row.id, label: row.term, key });
  };
  for (const row of rows) add(row.term, row);
  for (const row of rows) for (const value of row.aliases) add(value, row);
  return {
    active: root.size > 0,
    lookup(term) {
      let branch = root;
      for (const unit of termKey(term)) branch = branch?.get(unit);
      return branch?.get(end);
    },
    ranges(text) {
      // Map each normalized Unicode unit back to its original UTF-16 span.
      const chars = [], starts = [], ends = [];
      let offset = 0;
      for (const part of text.matchAll(/\s+|\P{M}\p{M}*|\p{M}+/gu)) {
        const raw = part[0];
        offset = part.index;
        for (const unit of /^\s/u.test(raw) ? ' ' : raw.normalize('NFKC').toLowerCase()) {
          chars.push(unit); starts.push(offset); ends.push(offset + raw.length);
        }
      }
      const found = [];
      for (let i = 0; i < chars.length; i++) {
        if (i > 0 && starts[i] === starts[i - 1]) continue;
        let best;
        let branch = root;
        for (let j = i; j < chars.length; j++) {
          branch = branch.get(chars[j]);
          if (!branch) break;
          const match = branch.get(end);
          if (!match || ends[j] === ends[j + 1]) continue;
          if (word.test(chars[i]) && word.test(before(text, starts[i]))) continue;
          if (word.test(chars[j]) && word.test(after(text, ends[j]))) continue;
          best = { ...match, start: starts[i], end: ends[j], last: j };
        }
        if (best) { found.push(best); i = best.last; }
      }
      return found;
    },
  };
}

export function excerptAround(text, selection, max = 650) {
  const clean = cleanTerm(text);
  const at = clean.toLowerCase().indexOf(selection.toLowerCase());
  if (at < 0) return '';
  const left = Math.max(0, at - Math.floor((max - selection.length) / 2));
  return clean.slice(left, left + max);
}
