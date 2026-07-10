import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ADMIN_DEFAULT} from '../../src/admin/admin-constants.js';
import {
  DEFAULT_CONFIG,
  ENV_MAPPINGS,
} from '../../src/config/config-constants.js';
import {
  PGWIRE_AUTH_MODE,
  PGWIRE_TLS_MODE,
  validatePgwireRuntimeConfig,
} from '../../src/runtime/pgwire-descriptor.js';
import {PGWIRE_DEFAULT} from '../../src/runtime/pgwire-runtime-module.js';

const UTF8 = 'utf8';

describe('project hardening contracts', () => {
  it('keeps network defaults local and mutation enforcement active', () => {
    assert.equal(ADMIN_DEFAULT.HOST, '127.0.0.1');
    assert.equal(ADMIN_DEFAULT.ENFORCEMENT_MODE, 'enforce');
    assert.equal(PGWIRE_DEFAULT.HOST, '127.0.0.1');
    assert.equal(DEFAULT_CONFIG.admin.websocketHost, '127.0.0.1');
    assert.equal(DEFAULT_CONFIG.admin.allowInsecureExternalBind, false);
    assert.equal(
      ENV_MAPPINGS.ADMIN_WEBSOCKET_HOST,
      'admin.websocketHost',
    );

    const externalTrust = validatePgwireRuntimeConfig(JSON.stringify({
      host: '0.0.0.0',
      authMode: PGWIRE_AUTH_MODE.TRUST,
      tlsMode: PGWIRE_TLS_MODE.DISABLE,
    }));
    assert.equal(externalTrust.valid, false);
  });

  it('runs tests and strict dependency checks on every push', async () => {
    const [packageText, ciText, releaseText] = await Promise.all([
      readFile('package.json', UTF8),
      readFile('.forgejo/workflows/ci.yml', UTF8),
      readFile('RELEASE.md', UTF8),
    ]);
    const packageJson = JSON.parse(packageText);

    assert.equal(packageJson.main, 'src/public-api.js');
    assert.match(packageJson.scripts['test:fast'], /run-test-files\.js/u);
    assert.doesNotMatch(packageJson.scripts['test:fast'], /xargs[^|]*\s-r(?:\s|$)/u);
    assert.doesNotMatch(packageJson.scripts['test:deps'], /ignore-known/u);
    assert.match(ciText, /npm run test:gate/u);
    assert.match(ciText, /postgresql-client/u);
    assert.match(releaseText, /npm run test:gate/u);
  });
});
