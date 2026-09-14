import {test} from '../../../../src/test-helpers/tap.js';
import {mergeWithDefaults} from '../config-parser.js';

const BUILD_IMAGE_URL = new URL('../../build-image.js', import.meta.url);
const DOCKER_PROVIDER_URL = new URL('../docker-provider.js', import.meta.url);

function createFakeDockerProvider(created) {
  return class FakeDockerProvider {
    constructor(options) {
      this.options = options;
      this.builds = [];
      created.push(this);
    }

    async getImageLabel() {
      return null;
    }

    async imageExists() {
      return false;
    }

    async buildImage(contextPath, image, dockerfile, progressSink, labels) {
      this.builds.push({contextPath, image, dockerfile, progressSink, labels});
    }
  };
}

test('remote image build policy is preserved by config parsing', (t) => {
  const config = mergeWithDefaults({
    docker: {
      hosts: ['tcp://127.0.0.1:41001', 'tcp://127.0.0.1:41002'],
      buildOnHosts: true,
    },
  });
  t.equal(config.docker.buildOnHosts, true);
  t.same(config.docker.hosts, [
    'tcp://127.0.0.1:41001',
    'tcp://127.0.0.1:41002',
  ]);
  t.end();
});

test('buildImage builds the current image on every explicit host', async (t) => {
  const created = [];
  const DockerProvider = createFakeDockerProvider(created);
  const {buildImage} = await t.mockImport(BUILD_IMAGE_URL.href, {
    [DOCKER_PROVIDER_URL.href]: {DockerProvider},
  });
  const result = await buildImage({
    docker: {
      hosts: ['tcp://127.0.0.1:41001', 'tcp://127.0.0.1:41002'],
      buildOnHosts: true,
    },
    image: 'distributed-db:test',
  }, false, null, {
    gitHash: '0123456789ab',
    gitDirty: false,
  });

  t.equal(created.length, 2);
  t.same(created.map((provider) => provider.options.host), [
    'tcp://127.0.0.1:41001',
    'tcp://127.0.0.1:41002',
  ]);
  t.same(created.map((provider) => provider.builds.length), [1, 1]);
  for (const provider of created) {
    t.equal(provider.builds[0].image, 'distributed-db:test');
    t.equal(provider.builds[0].labels['ddb.git-hash'], '0123456789ab');
  }
  t.equal(result.reused, false);
});

test('buildImage keeps the historical local socket path by default', async (t) => {
  const created = [];
  const DockerProvider = createFakeDockerProvider(created);
  const {buildImage} = await t.mockImport(BUILD_IMAGE_URL.href, {
    [DOCKER_PROVIDER_URL.href]: {DockerProvider},
  });
  await buildImage({
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
  }, false, null, {
    gitHash: '0123456789ab',
    gitDirty: false,
  });

  t.equal(created.length, 1);
  t.equal(created[0].options.socketPath, '/var/run/docker.sock');
  t.equal(created[0].options.host, undefined);
});

test('buildOnHosts fails closed without explicit hosts', async (t) => {
  const created = [];
  const DockerProvider = createFakeDockerProvider(created);
  const {buildImage} = await t.mockImport(BUILD_IMAGE_URL.href, {
    [DOCKER_PROVIDER_URL.href]: {DockerProvider},
  });
  await t.rejects(
    buildImage({
      docker: {buildOnHosts: true},
      image: 'distributed-db:test',
    }, false, null, {
      gitHash: '0123456789ab',
      gitDirty: false,
    }),
    /buildOnHosts requires at least one docker\.hosts entry/u,
  );
  t.equal(created.length, 0);
});
