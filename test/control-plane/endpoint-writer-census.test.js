import {test} from '../../src/test-helpers/tap.js';
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  ENDPOINT_WRITERS,
  ENDPOINT_WRITE_CLASS,
  collectEndpointMutationSites,
} from './endpoint-writer-census.js';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

function srcFiles(directory, files = []) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) srcFiles(path, files);
    else if (path.endsWith('.js')) files.push(path);
  }
  return files;
}

test('every endpoint mutation path is a classified incarnation owner ' +
  '(a new, unclassified endpoint writer fails here)', (t) => {
  const sites = collectEndpointMutationSites();
  t.same(sites.filter((site) => !ENDPOINT_WRITERS[site]), [],
    'no unclassified endpoint mutation site');
  t.same(Object.keys(ENDPOINT_WRITERS).filter((site) => !sites.includes(site)),
    [], 'every classified writer is still a live site (entries only shrink)');
  t.end();
});

test('dormant endpoint writers have no runtime caller', (t) => {
  const dormantVerbs = Object.entries(ENDPOINT_WRITERS)
    .filter(([, entry]) =>
      entry.writeClass === ENDPOINT_WRITE_CLASS.DORMANT_DEBT)
    .map(([site]) => site.split('#')[1]);
  const callers = [];
  for (const path of srcFiles(join(REPO_ROOT, 'src'))) {
    const source = readFileSync(path, 'utf8');
    for (const verb of dormantVerbs) {
      if (new RegExp(`endpointService\\??\\.${verb}\\(`, 'u').test(source)) {
        callers.push(`${relative(REPO_ROOT, path)}:${verb}`);
      }
    }
  }
  t.same(callers, [], 'EndpointService mutation verbs are never called');
  t.end();
});
