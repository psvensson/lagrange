import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {ENTRYPOINT_DEFAULT} from '../../src/constants/entrypoint.js';
import {ADMIN_DEFAULT} from '../../src/admin/admin-constants.js';
import {TRANSPORT_DEFAULT} from '../../src/constants/transport.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENTRYPOINT_DEFAULTS_SCRIPT = path.resolve(
  __dirname,
  '../../scripts/entrypoint-defaults.js',
);

describe('entrypoint-defaults script', () => {
  it('keeps documentation and helpers aligned with listener defaults', () => {
    const surfaceContracts = [
      {
        path: 'docs/admin-api-reference.md',
        required: ['REST port + 1', 'ADMIN_WEBSOCKET_PORT'],
        forbidden: /Ingress is fixed/iu,
      },
      {
        path: 'docs/dockerhub-overview.md',
        required: ['ADMIN_WEBSOCKET_PORT', 'NODE_WS_PORT'],
        forbidden: /fixed at `8081`|admin stays `8081`/iu,
      },
      {
        path: 'docs/wasm-services-user-guide.md',
        required: ['REST port + 1'],
        forbidden: /Fixed port:/u,
      },
      {
        path: 'scripts/debug/admin-ws-connection-check.mjs',
        required: ['LISTENER_PORT_DEFAULT'],
        forbidden: /nodeAddress\s*=.*localhost:8081/u,
      },
      {
        path: 'scripts/examples/examples-runner-constants.js',
        required: ['LISTENER_PORT_DEFAULT'],
        forbidden: /DEFAULT_TARGET\s*=\s*'ws:\/\/127\.0\.0\.1:8081/u,
      },
      {
        path: 'scripts/start-admin-cli.sh',
        required: ['default admin port'],
        forbidden: /# Connect to localhost:8081/u,
      },
      {
        path: 'scripts/entrypoint-defaults.js',
        required: ['TRANSPORT_DEFAULT', 'transportWebSocketPort'],
        forbidden: /wsPortOffset/u,
      },
    ];

    for (const contract of surfaceContracts) {
      const source = fs.readFileSync(contract.path, 'utf8');
      for (const requiredText of contract.required) {
        assert.ok(
          source.includes(requiredText),
          `${contract.path} should expose ${requiredText}`,
        );
      }
      assert.doesNotMatch(
        source,
        contract.forbidden,
        `${contract.path} should not retain a contradictory fixed default`,
      );
    }
  });

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
    assert.equal(payload.transportWebSocketPort, TRANSPORT_DEFAULT.WS_PORT);
    assert.equal(payload.localhost, ENTRYPOINT_DEFAULT.LOCALHOST);
  });
});
