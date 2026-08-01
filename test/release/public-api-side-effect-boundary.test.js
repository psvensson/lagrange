import {readFile} from 'node:fs/promises';
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';

const RUNTIME_RESOURCE_PATTERN = /Server|Socket|TCP|Timer|Signal/u;

describe('package public API boundary', () => {
  it('imports without starting the daemon or retaining runtime handles',
    async () => {
      const before = process.getActiveResourcesInfo()
        .filter((resource) => RUNTIME_RESOURCE_PATTERN.test(resource));
      const module = await import('lagrange-server');
      const after = process.getActiveResourcesInfo()
        .filter((resource) => RUNTIME_RESOURCE_PATTERN.test(resource));
      const packageJson = JSON.parse(await readFile('package.json', 'utf8'));

      assert.equal(module.VERSION, packageJson.version);
      assert.deepEqual(after, before);
    });
});
