import { hostModule } from './src/host-module.js';
import { request, result } from './src/schema.js';

const codec = (name, schema) => ({ mode: 'strict', typeSymbol: `@local/dsh-eli5-card#${name}`, create: () => schema });
export const endpoint = 'eli5Cards/dispatch';
const input = codec('Request', request);
const descriptor = {
  id: `@local/dsh-eli5-card#${endpoint}`, service: 'eli5Cards', namespace: 'eli5Cards', method: 'dispatch',
  invocation: { kind: 'direct' }, parameters: [{ name: 'request', wire: 'request', source: 'json', codec: input, strictCodec: input }],
  cancellation: { parameter: 'signal' }, result: codec('Result', result),
};
export const TYPERT = {
  package: '@local/dsh-eli5-card', face: 'host', schemas: [], invocations: [descriptor],
  model: { services: [], events: [], objects: [] },
};

// Shared installer for package and Host-loader environments. The loader owns
// the exported manifest; no additional registry write is needed.
export const protocol = () => hostModule('@deepseek-ai/dsh-typert-protocol');
