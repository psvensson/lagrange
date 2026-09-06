/**
 * Evidence store (solve-v2 phase 1): an upload is recorded only after the
 * asset is downloaded again and re-hashes to the local file; a mismatch or a
 * failed listing records nothing; assets are named <quest-id>--<path under
 * solve/ with __> (the basename outside solve/).
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  ASSET_SEPARATOR,
  EVIDENCE_RELEASE_TAG,
  assetName,
  sha256Of,
  uploadAndVerify,
} from '../../scripts/solve/evidence-store.js';

function scratchFile(name, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-store-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, content);
  return file;
}

function fakeGh({corrupt = false, listed = true} = {}) {
  const calls = [];
  const uploaded = new Map();
  return {
    calls,
    run: (args) => {
      calls.push(args.join(' '));
      const [verb, action] = args;
      if (verb === 'release' && action === 'upload') {
        const staged = args[3];
        uploaded.set(path.basename(staged), fs.readFileSync(staged));
        return '';
      }
      if (verb === 'release' && action === 'download') {
        const name = args[args.indexOf('--pattern') + 1];
        const dir = args[args.indexOf('--dir') + 1];
        const bytes = uploaded.get(name);
        fs.writeFileSync(path.join(dir, name),
          corrupt ? Buffer.concat([bytes, Buffer.from('x')]) : bytes);
        return '';
      }
      if (verb === 'release' && action === 'view') {
        return JSON.stringify({assets: listed ?
          [...uploaded.keys()].map((name) =>
            ({name, url: `https://example.test/${name}`})) : []});
      }
      throw new Error(`unexpected gh ${args.join(' ')}`);
    },
  };
}

test('a verified upload returns sha256, size, asset name and URL', () => {
  const file = scratchFile('node-logs.tar.gz', 'tar bytes');
  const gh = fakeGh();
  const record = uploadAndVerify({file, questId: 'quest-a', run: gh.run,
    root: path.dirname(file)});
  assert.equal(record.asset, `quest-a${ASSET_SEPARATOR}node-logs.tar.gz`);
  assert.equal(record.sha256,
    crypto.createHash('sha256').update('tar bytes').digest('hex'));
  assert.equal(record.bytes, 9);
  assert.equal(record.url, 'https://example.test/quest-a--node-logs.tar.gz');
  assert.match(gh.calls[0], new RegExp(`^release upload ${EVIDENCE_RELEASE_TAG} .*quest-a--node-logs.tar.gz --clobber$`));
  assert.match(gh.calls[1], /^release download solve-evidence --pattern quest-a--node-logs.tar.gz --dir /);
  assert.equal(assetName('q', '/tmp/x/y.bin', '/tmp'), 'q--y.bin',
    'outside solve/ the basename is the original name');
  assert.equal(
    assetName('quest-a',
      'solve/changes/quest-a/live-ab/round-2/fixed-1/node-logs.tar.gz', '/r'),
    'quest-a--changes__live-ab__round-2__fixed-1__node-logs.tar.gz',
    'under solve/ the path (minus the quest directory) keeps siblings apart');
  assert.equal(
    assetName('quest-a',
      'solve/changes/quest-a/live-ab/round-2/fixed-2/node-logs.tar.gz', '/r'),
    'quest-a--changes__live-ab__round-2__fixed-2__node-logs.tar.gz');
  assert.equal(assetName('solve-v2-phase-1',
    'solve/artifacts/sha256/0f/abc.diff.gz', '/r'),
  'solve-v2-phase-1--artifacts__sha256__0f__abc.diff.gz');
  assert.equal(sha256Of(file), record.sha256);
});

test('a re-download that does not hash back refuses and records nothing', () => {
  const file = scratchFile('run-state.tar.gz', 'state');
  const gh = fakeGh({corrupt: true});
  assert.throws(() => uploadAndVerify({file, questId: 'quest-b', run: gh.run,
    root: path.dirname(file)}),
  /re-downloaded quest-b--run-state\.tar\.gz hashes to .*expected .*nothing recorded/u);
});

test('an upload the release does not list afterwards is refused', () => {
  const file = scratchFile('raw.tar.gz', 'raw');
  const gh = fakeGh({listed: false});
  assert.throws(() => uploadAndVerify({file, questId: 'quest-c', run: gh.run,
    root: path.dirname(file)}),
  /quest-c--raw\.tar\.gz not listed after upload/u);
});
