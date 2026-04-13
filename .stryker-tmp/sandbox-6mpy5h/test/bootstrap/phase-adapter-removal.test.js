// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {join} from 'node:path';

describe('bootstrap phase adapter removal', () => {
  const srcRoot = join(import.meta.dirname, '..', '..', 'src');
  const removedPhaseAdapterFiles = [
    'infrastructure-phase.js',
    'partition-phase.js',
    'message-group-phase.js',
    'cache-hydration-phase.js',
    'registration-phase.js',
  ];

  for (const fileName of removedPhaseAdapterFiles) {
    it(`${fileName} is deleted`, () => {
      const filePath = join(srcRoot, 'bootstrap', 'phases', fileName);
      assert.equal(
        existsSync(filePath),
        false,
        `${filePath} should be deleted`,
      );
    });
  }
});
