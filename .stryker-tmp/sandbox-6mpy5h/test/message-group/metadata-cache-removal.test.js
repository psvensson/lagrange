// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import * as messageGroupModule from '../../src/message-group/index.js';

describe('MetadataCache removal', () => {
  const srcRoot = join(import.meta.dirname, '..', '..', 'src');

  it('metadata-cache.js is deleted', () => {
    const filePath = join(srcRoot, 'message-group', 'metadata-cache.js');
    assert.equal(
      existsSync(filePath),
      false,
      'src/message-group/metadata-cache.js should be deleted',
    );
  });

  it('message-group index does not export MetadataCache symbols', () => {
    const removedExports = [
      'MetadataCache',
      'CacheEntry',
      'CacheEntryStatus',
      'DEFAULT_CACHE_CONFIG',
    ];

    for (const exportName of removedExports) {
      assert.equal(
        exportName in messageGroupModule,
        false,
        `${exportName} should not be exported from src/message-group/index.js`,
      );
    }
  });
});
