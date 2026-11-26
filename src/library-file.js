import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { open, link, rename, rm, realpath, lstat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, extname, isAbsolute, join } from 'node:path';
import { cardSchema } from './schema.js';

const FORMAT = 'eli5-card-library/v1';
const MAX_BYTES = 128 * 1024 * 1024;
export async function libraryPath(input) {
  if (input.startsWith('~/')) input = join(homedir(), input.slice(2));
  if (!isAbsolute(input) || extname(input).toLowerCase() !== '.json') throw new Error('Expected an absolute JSON file path');
  return join(await realpath(dirname(input)), basename(input));
}

const stamp = stat => [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs].join(':');

async function read(file) {
  const target = await lstat(file);
  if (!target.isFile() || target.size > MAX_BYTES) throw new Error('Invalid library file');
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_BYTES) throw new Error('Invalid library file');
    const data = JSON.parse(await handle.readFile('utf8'));
    if (data?.schema !== FORMAT || !Array.isArray(data.cards) || data.cards.length > 3000) throw new Error('Invalid library format');
    const records = new Map();
    for (const raw of data.cards) {
      const card = cardSchema.parse(raw);
      if (records.has(card.id)) throw new Error('Duplicate card');
      records.set(card.id, card);
    }
    return { records, version: stamp(stat) };
  } finally { await handle.close(); }
}

async function write(file, records, version) {
  const body = JSON.stringify({ schema: FORMAT, cards: [...records.values()] }, null, 2) + '\n';
  if (Buffer.byteLength(body) > MAX_BYTES) throw new Error('Library size limit exceeded');
  const temp = join(dirname(file), `.eli5-${randomUUID()}.tmp`);
  const handle = await open(temp, 'wx', 0o600);
  try {
    try { await handle.writeFile(body, 'utf8'); await handle.sync(); }
    finally { await handle.close(); }
    if (!version) await link(temp, file); // Never clobber a file when selecting a new path.
    else {
      if (stamp(await lstat(file)) !== version) throw new Error('Card library has changed on disk');
      await rename(temp, file);
    }
  } finally { await rm(temp, { force: true }).catch(() => {}); }
  return stamp(await lstat(file));
}

export async function openLibraryFile(file, seed) {
  let records, version;
  try { ({ records, version } = await read(file)); }
  catch (error) {
    if (error.code !== 'ENOENT' || !seed) throw error;
    records = new Map(seed);
    version = await write(file, records);
  }
  let queue = Promise.resolve();
  const mutate = fn => {
    const result = queue.then(async () => {
      const next = new Map(records);
      const value = fn(next);
      if (value !== false) {
        version = await write(file, next, version);
        records = next;
      }
      return value;
    });
    queue = result.catch(() => {});
    return result;
  };
  return {
    get size() { return records.size; },
    entries: () => records.entries(),
    get: id => records.get(id),
    put: (id, card) => mutate(next => { next.set(id, cardSchema.parse(card)); }),
    delete: id => mutate(next => next.delete(id)),
  };
}
