import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const local = createRequire(import.meta.url);
// Use the same Cordis/Typert/LLM module generation as the running Host. Bundles
// installed as local links need not have the Host's node_modules as an ancestor.
const anchors = [process.env.DSH_INSTALL_DIR,
  process.resourcesPath && join(process.resourcesPath, 'app.asar', 'dsh'),
  process.argv[1]].filter(Boolean);
export async function hostModule(name) {
  for (const resolve of [...anchors.map(path => createRequire(join(path, 'package.json'))), local]) {
    let filename;
    try { filename = resolve.resolve(name); } catch (error) {
      if (error.code !== 'MODULE_NOT_FOUND') throw error;
      continue;
    }
    return import(pathToFileURL(filename).href);
  }
  throw new Error(`ELI5 could not resolve the Host module ${name}`);
}
