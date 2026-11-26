// Runs with the installed Harness runtime, temporary JSON storage and a fixture LLM.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Eli5Cards from '../index.js';
import { hostModule } from '../src/host-module.js';
import { resolveLinks } from '../src/card.js';
import { TYPERT } from '../typert.js';

const load = name => hostModule(`@deepseek-ai/${name}`);
const [{ Context }, { TypertRegistry }, { TypertGatewayService }, { validateTypertManifest }, { Storage }, jsonStorage, storageDomain] = await Promise.all([
  load('cordis'), load('dsh-typert-registry'), load('dsh-api-gateway'), load('dsh-typert-loader'),
  load('dsh-storage'), load('dsh-storage-json'), load('dsh-storage-domain'),
]);
const root = new Context();
const initial = { prompt: '', background: '', route: null, storagePath: '' };
const route = { provider: 'fixture', model: 'model/v2' };
const explicitRoute = { provider: 'fixture', model: 'model/explicit' };
const illustration = { title: '缓存像抽屉', summary: '把常用物品放近一点。', analogy: '像桌边的小抽屉。', aliases: ['cache'], tags: [], related: [], visual: {
  alt: '抽屉和书', shapes: [
    { kind: 'circle', x: 100, y: 100, r: 40, color: 'sky' },
    { kind: 'symbol', x: 100, y: 100, size: 40, color: 'ink', text: '📚' },
    { kind: 'line', x: 140, y: 100, x2: 220, y2: 100, color: 'blue', arrow: true },
  ],
} };
const context = { before: '浏览器把数据放进', after: '以便下次更快读取。', question: '网页为什么第二次打开更快？' };
const modelInputs = [];
let generationCount = 0;
let providerAvailable = false;
let alwaysMalformed = false;
root.provide('remoteAccess', { decide: () => ({ kind: 'deny', reason: 'test' }) });
root.provide('sessionController', { resolveAgent: async id => {
  assert.ok(['fixture-session', 'another-session'].includes(id));
  return { agent: { model: { current: () => route } } };
} });
root.provide('agentDefaultModel', { currentSelection: () => { throw Error('should follow the conversation model'); } });
root.provide('llm', {
  listProviders: () => [{ id: route.provider, name: 'Fixture' }, { id: 'intermittent', name: 'Intermittent' }],
  listModels: async provider => {
    if (provider === 'intermittent') {
      if (!providerAvailable) throw Error('Temporary test outage');
      return [{ id: 'recovered', name: 'Recovered model' }];
    }
    assert.equal(provider, route.provider);
    return [{ id: route.model, name: 'Illustrator' }, { id: explicitRoute.model, name: 'Explicit' }];
  },
  resolveModelInfo: async (provider, model) => assert.deepEqual({ provider, model }, explicitRoute),
  prepareCall: async (config, signal) => {
    generationCount++;
    assert.equal(signal.aborted, false);
    return { config, async *stream({ messages, system }) {
      const input = JSON.parse(messages[0].content[0].text);
      modelInputs.push(input);
      if (input.question) {
        assert.equal(input.term, '内存');
        assert.equal(config.model, explicitRoute.model);
        assert.match(system, /Answer a follow-up question/u);
        assert.deepEqual(input.prior.map(turn => turn.question), input.question === '有什么区别？' ? [] : ['有什么区别？']);
        yield { type: 'text-delta', index: 0, text: '内存像桌面，断电不会保存。' };
        yield { type: 'finish', reason: { kind: 'stop' } };
        return;
      }
      const explicit = input.term === '内存';
      assert.equal(input.term, explicit ? '内存' : '缓存');
      assert.equal(config.model, explicit ? explicitRoute.model : route.model);
      assert.equal(config.provider, route.provider);
      assert.match(system, explicit ? /适合初学者\nReader background: 工程师/u : /big picture/u);
      assert.match(system, /only to identify the intended meaning/u);
      const retry = system.includes('The previous attempt did not match the schema');
      const response = explicit ? { ...illustration, title: '内存像桌面', aliases: [], related: [{ term: '缓存', reason: '都可以临时存放数据' }] } : illustration;
      const malformed = alwaysMalformed || (explicit && !retry);
      const text = malformed ? '<article>Invalid model response</article>' : JSON.stringify(response);
      yield { type: 'text-delta', index: 0, text };
      yield { type: 'finish', reason: { kind: explicit && !retry && !alwaysMalformed ? 'max-tokens' : 'stop' } };
    } };
  },
});
const directory = await mkdtemp(join(tmpdir(), 'dsh-eli5-check-'));
const storage = root.plugin(Storage);
const backend = root.plugin(jsonStorage, { root: directory });
const domain = root.plugin(storageDomain, { backend: 'json' });
const registry = root.plugin(TypertRegistry);
const gateway = root.plugin(TypertGatewayService);
let plugin = root.plugin(Eli5Cards);
let contribution;
async function ready() {
  for (let attempt = 0; !root.typert || !root.typertGateway || !root.eli5Cards; attempt++) {
    if (attempt === 100) throw new Error('Test Host services did not activate');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
const peer = { id: 'fixture-peer', principal: { kind: 'owner' }, ctx: root, signal: new AbortController().signal, interactions: 'none' };
const call = request => root.typertGateway.dispatchRpc('eli5Cards/dispatch', { args: { request } }, undefined, peer);
const result = async request => {
  const response = await call(request);
  assert.equal(response.ok, true, JSON.stringify(response));
  return response.value;
};
try {
  await ready();
  contribution = root.typert.register(validateTypertManifest(TYPERT.package, TYPERT));
  assert.deepEqual(await result({ action: 'list' }), { settings: initial, cards: [] });
  const partialCatalog = await result({ action: 'models' });
  assert.equal(partialCatalog.incomplete, true);
  assert.deepEqual(partialCatalog.models.map(model => model.model), ['model/v2', 'model/explicit']);
  providerAvailable = true;
  const recoveredCatalog = await result({ action: 'models' });
  assert.equal(recoveredCatalog.incomplete, false);
  assert.ok(recoveredCatalog.models.some(model => model.provider === 'intermittent' && model.model === 'recovered'));
  let { card } = await result({ action: 'explain', term: '缓存', language: 'zh', sessionId: 'fixture-session', context });
  assert.deepEqual(card.route, route);
  assert.equal(card.sourceSessionId, 'fixture-session');
  assert.equal((await result({ action: 'list' })).cards[0].sourceSessionId, 'fixture-session');
  assert.equal(Object.hasOwn(root.storageDomain.get('eli5_card').table('cards').get(card.id), 'context'), false);
  assert.deepEqual(await result({ action: 'explain', term: '缓存', language: 'zh', sessionId: 'fixture-session', context }), { card });
  assert.equal(generationCount, 1);
  const { card: differentMeaning } = await result({ action: 'explain', term: '缓存', language: 'zh', sessionId: 'another-session',
    context: { ...context, question: '屏幕上的这个缓存是什么意思？' } });
  assert.equal(differentMeaning.id, card.id);
  assert.equal(differentMeaning.sourceSessionId, 'another-session');
  assert.deepEqual(modelInputs[0].turn_context, context);
  assert.deepEqual(modelInputs[1].turn_context, { ...context, question: '屏幕上的这个缓存是什么意思？' });
  assert.equal(generationCount, 2);
  assert.deepEqual((await result({ action: 'read', id: card.id })).card, differentMeaning);
  card = differentMeaning;
  assert.deepEqual(await result({ action: 'explain', term: 'cache', language: 'en', sessionId: 'another-session' }), { card });
  assert.equal(card.sourceSessionId, 'another-session');
  assert.equal(generationCount, 2);
  assert.equal((await result({ action: 'list' })).cards.length, 1);
  const edited = { prompt: '适合初学者', background: '工程师', route: explicitRoute, storagePath: '' };
  assert.deepEqual(await result({ action: 'settings', settings: edited }), { settings: edited });
  const { card: explicit } = await result({ action: 'explain', term: '内存', language: 'zh', sessionId: 'explicit-only-session' });
  assert.deepEqual(explicit.route, explicitRoute);
  assert.deepEqual(explicit.related, [{ term: '缓存', reason: '都可以临时存放数据' }]);
  assert.equal(generationCount, 4, 'Malformed model output should trigger exactly one retry');
  assert.deepEqual(modelInputs[2], modelInputs[3]);
  alwaysMalformed = true;
  const formatFailure = await call({ action: 'explain', term: '内存', language: 'zh', sessionId: 'explicit-only-session', context });
  assert.equal(formatFailure.ok, false);
  assert.equal(formatFailure.error.code, 'eli5Cards/format');
  assert.equal(generationCount, 6, 'A permanently malformed response must not retry more than once');
  assert.deepEqual(await result({ action: 'read', id: explicit.id }), { card: explicit });
  const { card: firstAnswer } = await result({ action: 'ask', id: explicit.id, question: '有什么区别？' });
  assert.equal(firstAnswer.followUps.length, 1);
  assert.equal(firstAnswer.sourceSessionId, explicit.sourceSessionId);
  const parent = await realpath(directory);
  const invalidPath = join(parent, 'unrelated.json');
  await writeFile(invalidPath, '{"keep":true}');
  assert.equal((await call({ action: 'settings', settings: { ...edited, storagePath: invalidPath } })).ok, false);
  assert.equal(await readFile(invalidPath, 'utf8'), '{"keep":true}');
  const external = { ...edited, storagePath: join(parent, 'custom-library.json') };
  assert.deepEqual(await result({ action: 'settings', settings: external }), { settings: external });
  const { card: secondAnswer } = await result({ action: 'ask', id: explicit.id, question: '那缓存呢？' });
  const snapshot = JSON.parse(await readFile(external.storagePath, 'utf8'));
  assert.deepEqual(snapshot.cards.find(card => card.id === explicit.id), secondAnswer);
  assert.equal(secondAnswer.followUps.length, 2);
  assert.deepEqual(root.storageDomain.get('eli5_card').table('cards').get(explicit.id), firstAnswer);
  await plugin.dispose();
  plugin = root.plugin(Eli5Cards);
  await ready();
  const reloaded = await result({ action: 'list' });
  assert.deepEqual(reloaded.settings, external);
  assert.deepEqual(resolveLinks(reloaded.cards).edges, [{ from: explicit.id, to: card.id, reason: '都可以临时存放数据' }]);
  assert.deepEqual(await result({ action: 'read', id: card.id }), { card });
  assert.deepEqual(await result({ action: 'read', id: explicit.id }), { card: secondAnswer });
  assert.equal((await result({ action: 'remove', id: card.id })).removed, true);
  assert.equal((await call({ action: 'read', id: card.id })).ok, false);
  const externalEdit = '{"replaced":true}';
  await writeFile(external.storagePath, externalEdit);
  assert.equal((await call({ action: 'remove', id: explicit.id })).ok, false);
  assert.equal(await readFile(external.storagePath, 'utf8'), externalEdit);
  assert.deepEqual(await result({ action: 'settings', settings: edited }), { settings: edited });
  assert.deepEqual(await result({ action: 'read', id: explicit.id }), { card: firstAnswer });
  assert.equal((await root.typertGateway.dispatchRpc('eli5Cards/dispatch', { args: { request: { action: 'list' } } }, undefined,
    { ...peer, principal: { kind: 'test-guest' } })).ok, false);
  console.log('Installed Cordis, Typert Gateway, and JSON persistence passed (fixture model).');
} finally {
  await contribution?.();
  await plugin.dispose();
  await gateway.dispose();
  await registry.dispose();
  await domain.dispose();
  await backend.dispose();
  await storage.dispose();
  const target = await realpath(directory);
  assert.match(target, /\/dsh-eli5-check-[^/]+$/u);
  await rm(target, { recursive: true });
}
