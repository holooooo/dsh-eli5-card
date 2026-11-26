import test from 'node:test';
import assert from 'node:assert/strict';
import { makeMatcher } from '../src/matching.js';
import { markdownFor, resolveLinks, svgFor } from '../src/card.js';
import { basePrompt, cardSchema, parseExplanation, preferences, request, result, summarySchema } from '../src/schema.js';
import { graphDataFor, labelRadius } from '../src/graph-data.js';
import { libraryPath, openLibraryFile } from '../src/library-file.js';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { realpath } from 'node:fs/promises';
import { clampPopupPosition } from '../src/popup-position.js';
import { clipContext, CONTEXT_SIDE_LIMIT, CONTEXT_QUESTION_LIMIT } from '../src/turn-context.js';

const sample = (overrides = {}) => ({
  id: 'a'.repeat(32), term: '缓存', title: '缓存像抽屉', summary: '把常用物品放近一点。', analogy: '像桌边的小抽屉。',
  aliases: ['cache'], tags: ['计算机'], related: [{ term: '内存', reason: '常用数据暂存处' }],
  route: { provider: 'local', model: 'test' }, createdAt: '2026-01-01T00:00:00.000Z', language: 'zh',
  visual: { alt: '抽屉和书本', shapes: [
    { kind: 'circle', x: 100, y: 100, r: 40, color: 'sky' },
    { kind: 'symbol', x: 100, y: 100, size: 40, color: 'ink', text: '<book>' },
    { kind: 'line', x: 140, y: 100, x2: 220, y2: 100, color: 'blue', arrow: true },
  ] }, ...overrides,
});

test('matches saved Chinese terms, aliases, and full Latin tokens', () => {
  const matcher = makeMatcher([{ id: '1', term: '缓存', aliases: ['cache'] }]);
  assert.equal(matcher.lookup(' CACHE ').id, '1');
  assert.deepEqual(matcher.ranges('缓存很方便，cache 也一样。').map(({ start, end }) => [start, end]), [[0, 2], [6, 11]]);
  assert.deepEqual(matcher.ranges('cacheback'), []);
});

test('preserves original UTF-16 offsets after NFKC normalization', () => {
  const matcher = makeMatcher([{ id: '1', term: 'ABC', aliases: [] }]);
  const text = '前ＡＢＣ后';
  const match = matcher.ranges(text)[0];
  assert.equal(text.slice(match.start, match.end), 'ＡＢＣ');
});

test('resolves only explicit, stored related-card links', () => {
  const a = sample(); const b = sample({ id: 'b'.repeat(32), term: '内存', aliases: [], related: [] });
  assert.equal(resolveLinks([a, b]).edges.length, 1);
  assert.equal(resolveLinks([a]).edges.length, 0);
});

test('projects isolated nodes and explicit links into renderer-owned data', () => {
  const a = sample();
  const b = sample({ id: 'b'.repeat(32), term: '内存', aliases: [], related: [] });
  const c = sample({ id: 'c'.repeat(32), term: '孤立概念', aliases: [], related: [] });
  const cards = [a, b, c];
  const { nodes, links } = graphDataFor(cards);
  assert.deepEqual(nodes.map(node => node.degree), [1, 1, 0]);
  assert.deepEqual(links, [{ source: a.id, target: b.id }]);
  links[0].source = nodes[0]; nodes[0].x = 120;
  assert.deepEqual(resolveLinks(cards).edges, [{ from: a.id, to: b.id, reason: '常用数据暂存处' }]);
  assert.equal(a.x, undefined);
});

test('switches to a validated personal JSON library atomically', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'eli5-library-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'library.json');
  const cards = await openLibraryFile(file, []);
  const original = cardSchema.parse(sample());
  await cards.put(original.id, original);
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')).cards, [original]);
  const reopened = await openLibraryFile(file);
  assert.deepEqual(reopened.get(original.id), original);
  const before = await readFile(file, 'utf8');
  await writeFile(file, '{"unrelated":true}');
  await assert.rejects(reopened.delete(original.id), /changed on disk/u);
  assert.equal(await readFile(file, 'utf8'), '{"unrelated":true}');
  const another = join(dir, 'unrelated.json');
  await writeFile(another, '{"not":"our format"}');
  await assert.rejects(openLibraryFile(another, [[original.id, original]]), /Invalid library format/u);
  assert.equal(await readFile(another, 'utf8'), '{"not":"our format"}');
  assert.notEqual(before, await readFile(file, 'utf8'));
  assert.equal(await libraryPath(file), await realpath(file));
  await assert.rejects(libraryPath(join(dir, 'missing', 'library.json')));
  await assert.rejects(libraryPath(join(dir, 'library.txt')));
});

test('only shows a node name when its projected size is readable', () => {
  const node = { degree: 0 };
  assert.ok(labelRadius(node, 100, 400) > 11);
  assert.equal(labelRadius(node, 300, 400), 0);
  assert.equal(labelRadius(node, -100, 400), 0);
  assert.equal(labelRadius(node, 100, 160), 0);
});

test('validates legacy and new follow-up records', () => {
  const card = cardSchema.parse(sample());
  assert.deepEqual(card.followUps, []);
  const question = request.parse({ action: 'ask', id: card.id, question: '  How does it work?  ' });
  assert.equal(question.question, 'How does it work?');
  assert.throws(() => request.parse({ ...question, question: ' ' }));
  assert.throws(() => request.parse({ ...question, question: 'a'.repeat(501) }));
  assert.deepEqual(cardSchema.parse({ ...card, followUps: [{ question: question.question, answer: 'One point.\nAnother.', createdAt: card.createdAt }] }).followUps[0].answer, 'One point.\nAnother.');
});

test('reads one fenced card with prose and CRLF but rejects unsafe or invalid illustrations', () => {
  const { title, summary, analogy, visual } = sample();
  const text = JSON.stringify({ title, summary, analogy, visual });
  const entry = parseExplanation(`图解如下：\r\n\`\`\`JSON\r\n${text}\r\n\`\`\`\r\n`, '缓存');
  assert.deepEqual(entry, { title, summary, analogy, visual, aliases: [], tags: [], related: [] });
  assert.throws(() => parseExplanation('<svg>not a JSON card</svg>', '缓存'));
  assert.throws(() => parseExplanation(`\`\`\`json\n${text}\n\`\`\`\n\`\`\`json\n${text}\n\`\`\``, '缓存'));
  assert.throws(() => parseExplanation(JSON.stringify({ title, summary, analogy, visual: { ...visual, shapes: [{ kind: 'script' }] } }), '缓存'));
});

test('round-trips separate prompt preferences and keeps the conversation model as default', () => {
  const settings = preferences.parse({ prompt: 'Use plain language.', background: 'A working engineer.', route: null });
  assert.deepEqual(settings, { prompt: 'Use plain language.', background: 'A working engineer.', route: null, storagePath: '' });
  assert.match(basePrompt, /big picture/u);
  const compatibleSettings = preferences.parse({ prompt: '', route: null });
  assert.equal(compatibleSettings.background, '');
});

test('clips nearby context to strict limits without splitting Unicode surrogate pairs', () => {
  assert.equal(clipContext('甲'.repeat(1000), CONTEXT_SIDE_LIMIT).length, CONTEXT_SIDE_LIMIT);
  assert.equal(clipContext('甲'.repeat(1000), CONTEXT_SIDE_LIMIT, true).length, CONTEXT_SIDE_LIMIT);
  const hasLoneSurrogate = text => [...text].some(char => char.length === 1 && char.charCodeAt(0) >= 0xD800 && char.charCodeAt(0) <= 0xDFFF);
  assert.equal(hasLoneSurrogate(clipContext('😀'.repeat(400), CONTEXT_SIDE_LIMIT, true)), false);
  assert.equal(hasLoneSurrogate(clipContext(' '.repeat(10) + '😀'.repeat(400), CONTEXT_SIDE_LIMIT)), false);
  assert.equal(clipContext('题'.repeat(1000), CONTEXT_QUESTION_LIMIT).length, CONTEXT_QUESTION_LIMIT);
});

test('allows optional, bounded same-turn context and rejects extra payloads', () => {
  const explanationRequest = request.parse({ action: 'explain', term: '缓存', sessionId: 'session-1', language: 'zh' });
  assert.equal(explanationRequest.term, '缓存');
  assert.equal(explanationRequest.context, undefined);
  const context = { before: '浏览器把数据放进', after: '以便下次更快读取。', question: '网页为什么第二次打开更快？' };
  assert.deepEqual(request.parse({ ...explanationRequest, context }).context, context);
  assert.throws(() => request.parse({ ...explanationRequest, context: { ...context, before: 'x'.repeat(451) } }));
  assert.throws(() => request.parse({ ...explanationRequest, context: { ...context, after: 'x'.repeat(451) } }));
  assert.throws(() => request.parse({ ...explanationRequest, context: { ...context, question: 'x'.repeat(501) } }));
  assert.throws(() => request.parse({ ...explanationRequest, context: { ...context, history: 'ignored' } }));
});

test('decodes the dedicated model catalog response shape', () => {
  const catalog = result.parse({ models: [{ provider: 'local/path', model: 'model/v2', label: 'Helpful model' }], incomplete: false });
  assert.equal(catalog.models[0].provider, 'local/path');
  assert.equal(catalog.models[0].model, 'model/v2');
});

test('round-trips cards with and without source-session metadata', () => {
  const legacy = cardSchema.parse(sample());
  assert.equal(legacy.sourceSessionId, undefined);
  const card = cardSchema.parse(sample({ sourceSessionId: 'source-session' }));
  assert.equal(result.parse({ card }).card.sourceSessionId, 'source-session');
  assert.equal(summarySchema.parse(card).sourceSessionId, 'source-session');
});

test('clamps popup position after dragging and after the illustration expands', () => {
  const view = { viewportWidth: 800, viewportHeight: 640 };
  const point = { left: 999, top: 999 };
  const loading = clampPopupPosition(point, { width: 480, height: 180 }, view);
  assert.deepEqual(loading, { left: 308, top: 448 });
  assert.deepEqual(clampPopupPosition(loading, { width: 480, height: 530 }, view), { left: 308, top: 98 });
  assert.deepEqual(clampPopupPosition({ left: -30, top: -50 }, { width: 300, height: 95 }, view), { left: 12, top: 12 });
});

test('exports markdown metadata and escapes SVG model text', () => {
  const card = sample();
  assert.match(markdownFor(card), /^---\nschema: eli5-card\/v1/m);
  assert.doesNotMatch(markdownFor(card), /sourceSessionId/u);
  const sourced = markdownFor(sample({ sourceSessionId: 'source-session' }));
  assert.match(sourced, /sourceSessionId: "source-session"/u);
  const svg = svgFor(card.visual);
  assert.match(svg, /&lt;book&gt;/);
  assert.doesNotMatch(svg, /<book>/);
});
