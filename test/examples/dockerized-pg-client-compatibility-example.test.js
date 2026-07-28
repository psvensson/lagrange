import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const EXAMPLE_ROOT = new URL('../../examples/service-portability/', import.meta.url);

async function readExample(relativePath) {
  return readFile(new URL(relativePath, EXAMPLE_ROOT), 'utf8');
}

describe('dockerized pg client compatibility example contract', () => {
  it('builds one ordinary pg application image without its server key',
    async () => {
      const dockerfile = await readExample('app/Dockerfile');
      const application = await readExample('app/server.js');

      assert.match(dockerfile, /ENTRYPOINT \["node"\]/u);
      assert.match(dockerfile, /CMD \["server\.js"\]/u);
      assert.doesNotMatch(dockerfile, /server-key\.pem/u);
      assert.match(application, /new Pool\(/u);
      assert.match(application, /PORTABLE_SQL\.BEGIN/u);
      assert.match(application, /VALUES \(\$1, \$2, \$3\)/u);
      assert.match(application, /ORDER BY score DESC, id ASC/u);
      assert.doesNotMatch(application, /LAGRANGE|POSTGRESQL_TARGET/u);
    });

  it('documents a bounded compatibility claim and one-command live proof',
    async () => {
      const readme = await readExample('README.md');
      const runner = await readExample('run-database-portability.js');

      assert.match(readme, /PostgreSQL slice exercised here is intentionally explicit/iu);
      assert.match(readme, /not.*arbitrary ORM compatibility/iu);
      assert.match(readme, /run-database-portability\.js/u);
      assert.match(runner, /createRuntimeStartupWiring/u);
      assert.match(runner, /allContainerImageIdsMatch/u);
      assert.match(runner, /wrongCertificateAuthority/u);
      assert.match(runner, /rejected_before_sql/u);
      assert.match(runner, /createdContainers\.add/u);
      assert.match(runner, /failAfterFirstApplicationCreate/u);
      assert.match(runner, /\[\.\.\.createdContainers\]\.reverse/u);
    });
});
