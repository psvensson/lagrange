import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {ENTRYPOINT_DEFAULT} from '../../src/constants/entrypoint.js';
import {ADMIN_DEFAULT} from '../../src/admin/admin-constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENTRYPOINT_DEFAULTS_SCRIPT = path.resolve(
  __dirname,
  '../../scripts/entrypoint-defaults.js',
);

describe('entrypoint-defaults script', () => {
  it('returns expected default ports for helper scripts', () => {
    const result = spawnSync(
      'node',
      [ENTRYPOINT_DEFAULTS_SCRIPT],
      {encoding: 'utf8'},
    );

    assert.equal(result.status, 0);
    const payload = JSON.parse(result.stdout);

    assert.equal(payload.restApiPort, ENTRYPOINT_DEFAULT.REST_API_PORT);
    assert.equal(payload.adminPort, ADMIN_DEFAULT.WEBSOCKET_PORT);
    assert.equal(payload.wsPortOffset, ENTRYPOINT_DEFAULT.WS_PORT_OFFSET);
    assert.equal(payload.localhost, ENTRYPOINT_DEFAULT.LOCALHOST);
  });
});
