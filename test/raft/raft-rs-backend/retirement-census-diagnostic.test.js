// Diagnostic-only branch: preserve the exact old census matches and paths.
// Its deliberate RED is not an acceptance gate or a production correction.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readdirSync, readFileSync} from 'node:fs';
import {join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
function collect(directory) {
  return readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? collect(path) :
      entry.isFile() && path.endsWith('.js') ? [path] : [];
  });
}

test('diagnostic: identify every receiver matched by the inherited census', () => {
  const calls = collect(join(root, 'src')).flatMap((path) => {
    const source = readFileSync(path, 'utf8');
    return [...source.matchAll(/\.retireReplica\(([\s\S]*?)\);/gu)].map((match) => ({
      path: relative(root, path),
      line: source.slice(0, match.index).split('\n').length,
      context: source.slice(Math.max(0, match.index - 100), match.index),
      arguments: match[1],
    }));
  });
  assert.fail('DIAGNOSTIC_ONLY_NO_ACCEPTANCE: ' + JSON.stringify(calls));
});
