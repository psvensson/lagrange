import assert from 'node:assert/strict';
import {setTimeout as sleep} from 'node:timers/promises';
import {DockerProvider} from '../harness/docker-provider.js';

const DEFAULT_HOST_COUNT = 3;
const DEFAULT_HOST_OFFSET = 3;
const DEFAULT_READY_TIMEOUT_MS = 180000;
const DEFAULT_READY_POLL_MS = 1000;
const DEFAULT_PD_CLIENT_PORT = 8700;
const DEFAULT_PD_PEER_PORT = 8701;
const DEFAULT_TIKV_PORT = 8710;
const DEFAULT_TIDB_PORT = 8720;
const DEFAULT_TIDB_STATUS_PORT = 8721;
const HOST_NETWORK = 'host';
const ZERO = 0;

const DEFAULT_IMAGES = Object.freeze({
  pd: 'pingcap/pd:v8.5.8',
  tikv: 'pingcap/tikv:v8.5.8',
  tidb: 'pingcap/tidb:v8.5.8',
  client: 'mysql:8.4',
});

const DEFAULT_RESOURCES = Object.freeze({
  pd: Object.freeze({memory: '768m', cpus: '0.5'}),
  tikv: Object.freeze({memory: '4g', cpus: '2.0'}),
  tidb: Object.freeze({memory: '2g', cpus: '1.0'}),
  client: Object.freeze({memory: '512m', cpus: '0.5'}),
});

class TiDbReferenceDockerProvider extends DockerProvider {
  async ensureRegistryImage(image) {
    const present = await this.inspectImage(image);
    if (present) {
      return present;
    }
    const stream = await this._docker.pull(image);
    await new Promise((resolvePromise, rejectPromise) => {
      this._docker.modem.followProgress(stream, (error) => {
        if (error) {
          rejectPromise(error);
          return;
        }
        resolvePromise();
      });
    });
    const pulled = await this.inspectImage(image);
    if (!pulled) {
      throw new Error(`TiDB reference image pull completed but ${image} is absent`);
    }
    return pulled;
  }
}

function scenarioOverride(cluster, scenarioName) {
  const value = cluster?._config?.scenarios?.[scenarioName];
  return value && typeof value === 'object' ? value : {};
}

function resolveRuntimeConfig(cluster, scenarioName) {
  const override = scenarioOverride(cluster, scenarioName);
  const images = {...DEFAULT_IMAGES, ...(override.images || {})};
  const ports = {
    pdClient: DEFAULT_PD_CLIENT_PORT,
    pdPeer: DEFAULT_PD_PEER_PORT,
    tikv: DEFAULT_TIKV_PORT,
    tidb: DEFAULT_TIDB_PORT,
    tidbStatus: DEFAULT_TIDB_STATUS_PORT,
    ...(override.ports || {}),
  };
  const resources = {
    pd: {...DEFAULT_RESOURCES.pd, ...(override.resources?.pd || {})},
    tikv: {...DEFAULT_RESOURCES.tikv, ...(override.resources?.tikv || {})},
    tidb: {...DEFAULT_RESOURCES.tidb, ...(override.resources?.tidb || {})},
    client: {...DEFAULT_RESOURCES.client, ...(override.resources?.client || {})},
  };
  return {
    images,
    ports,
    resources,
    hostCount: Number.isInteger(override.hostCount) ?
      override.hostCount : DEFAULT_HOST_COUNT,
    hostOffset: Number.isInteger(override.hostOffset) ?
      override.hostOffset : DEFAULT_HOST_OFFSET,
    readyTimeoutMs: Number.isInteger(override.readyTimeoutMs) ?
      override.readyTimeoutMs : DEFAULT_READY_TIMEOUT_MS,
    readyPollMs: Number.isInteger(override.readyPollMs) ?
      override.readyPollMs : DEFAULT_READY_POLL_MS,
    coprocessorV2: {
      requiredForClaim: override.coprocessorV2?.requiredForClaim === true,
      artifactIdentity: override.coprocessorV2?.artifactIdentity || null,
      comparatorMode: override.coprocessorV2?.comparatorMode || 'sql_pushdown',
    },
  };
}

function resolveComparatorHosts(cluster, runtimeConfig) {
  const docker = cluster?._config?.docker || {};
  const hosts = Array.isArray(docker.hosts) ? docker.hosts : [];
  const hostInfo = Array.isArray(docker.hostInfo) ? docker.hostInfo : [];
  const {hostOffset, hostCount} = runtimeConfig;
  assert.ok(
    hostCount >= DEFAULT_HOST_COUNT,
    'TiDB reference runtime requires at least three comparator hosts',
  );
  assert.ok(
    hosts.length >= hostOffset + hostCount,
    'TiDB reference runtime requires dedicated Docker hosts after the ' +
      `Lagrange hosts (need ${hostOffset + hostCount}, got ${hosts.length})`,
  );
  assert.ok(
    hostInfo.length >= hostOffset + hostCount,
    'TiDB reference runtime requires GCP hostInfo for comparator hosts',
  );
  assert.ok(
    docker.tls?.ca && docker.tls?.cert && docker.tls?.key,
    'TiDB reference runtime requires the GCP Docker TLS material',
  );
  return hosts.slice(hostOffset, hostOffset + hostCount).map((host, index) => {
    const info = hostInfo[hostOffset + index];
    assert.ok(info?.internalIp, 'TiDB comparator host is missing internalIp');
    return {
      index,
      dockerHost: host,
      internalIp: info.internalIp,
      externalIp: info.externalIp || null,
      provider: new TiDbReferenceDockerProvider({host, tls: docker.tls}),
    };
  });
}

function pdInitialCluster(hosts, peerPort) {
  return hosts
    .map((host) => `pd-${host.index}=http://${host.internalIp}:${peerPort}`)
    .join(',');
}

function pdEndpoints(hosts, clientPort) {
  return hosts
    .map((host) => `${host.internalIp}:${clientPort}`)
    .join(',');
}

function containerOptions({name, image, command, resources, labels}) {
  return {
    name,
    image,
    network: HOST_NETWORK,
    hostNetwork: true,
    command,
    labels,
    resourceLimits: resources,
  };
}

function mysqlCommand(port, sql) {
  return [
    'mysql',
    '--protocol=TCP',
    '--host=127.0.0.1',
    `--port=${port}`,
    '--user=root',
    '--batch',
    '--raw',
    '--skip-column-names',
    `--execute=${sql}`,
  ];
}

function requireCommonImageId(component, inspections) {
  const imageIds = [...new Set(inspections.map((inspection) => inspection?.Id))];
  assert.equal(
    imageIds.length,
    1,
    `${component} image identity differs across comparator hosts`,
  );
  assert.ok(imageIds[ZERO], `${component} image identity is missing`);
  return imageIds[ZERO];
}

async function removeContainerQuietly(provider, container) {
  if (!container?.containerId) {
    return;
  }
  try {
    await provider.removeContainer(container.containerId);
  } catch (_error) {
    // Cleanup is best effort; the scenario preserves the primary failure.
  }
}

class TiDbReferenceRuntime {
  constructor(cluster, scenarioName) {
    this.config = resolveRuntimeConfig(cluster, scenarioName);
    this.hosts = resolveComparatorHosts(cluster, this.config);
    this.runId = `tidb-ref-${scenarioName}-${process.pid}-${Date.now()}`;
    this.labels = Object.freeze({
      'lagrange.benchmark': 'tidb-reference',
      'lagrange.benchmark.scenario': scenarioName,
      'lagrange.benchmark.run': this.runId,
    });
    this.components = [];
    this.client = null;
    this.imageIds = null;
  }

  async ensureImages() {
    const {images} = this.config;
    const storageInspections = await Promise.all(this.hosts.map(async (host) => {
      const [pd, tikv] = await Promise.all([
        host.provider.ensureRegistryImage(images.pd),
        host.provider.ensureRegistryImage(images.tikv),
      ]);
      return {pd, tikv};
    }));
    const primary = this.hosts[ZERO];
    const [tidb, client] = await Promise.all([
      primary.provider.ensureRegistryImage(images.tidb),
      primary.provider.ensureRegistryImage(images.client),
    ]);
    this.imageIds = {
      pd: requireCommonImageId(
        'PD',
        storageInspections.map((inspection) => inspection.pd),
      ),
      tikv: requireCommonImageId(
        'TiKV',
        storageInspections.map((inspection) => inspection.tikv),
      ),
      tidb: tidb.Id,
      client: client.Id,
    };
  }

  async start() {
    await this.ensureImages();
    const {images, ports, resources} = this.config;
    const initialCluster = pdInitialCluster(this.hosts, ports.pdPeer);
    const pdContainers = await Promise.all(this.hosts.map(async (host) => {
      const container = await host.provider.createContainer(containerOptions({
        name: `${this.runId}-pd-${host.index}`,
        image: images.pd,
        resources: resources.pd,
        labels: this.labels,
        command: [
          `--name=pd-${host.index}`,
          '--data-dir=/data/pd',
          `--client-urls=http://0.0.0.0:${ports.pdClient}`,
          `--advertise-client-urls=http://${host.internalIp}:${ports.pdClient}`,
          `--peer-urls=http://0.0.0.0:${ports.pdPeer}`,
          `--advertise-peer-urls=http://${host.internalIp}:${ports.pdPeer}`,
          `--initial-cluster=${initialCluster}`,
          '--initial-cluster-state=new',
        ],
      }));
      this.components.push({provider: host.provider, container, role: 'pd'});
      return container;
    }));
    assert.equal(pdContainers.length, this.hosts.length);

    const pdAddressList = pdEndpoints(this.hosts, ports.pdClient);
    const tikvContainers = await Promise.all(this.hosts.map(async (host) => {
      const container = await host.provider.createContainer(containerOptions({
        name: `${this.runId}-tikv-${host.index}`,
        image: images.tikv,
        resources: resources.tikv,
        labels: this.labels,
        command: [
          `--addr=0.0.0.0:${ports.tikv}`,
          `--advertise-addr=${host.internalIp}:${ports.tikv}`,
          `--pd=${pdAddressList}`,
          '--data-dir=/data/tikv',
        ],
      }));
      this.components.push({provider: host.provider, container, role: 'tikv'});
      return container;
    }));
    assert.equal(tikvContainers.length, this.hosts.length);

    const primary = this.hosts[ZERO];
    const tidb = await primary.provider.createContainer(containerOptions({
      name: `${this.runId}-tidb`,
      image: images.tidb,
      resources: resources.tidb,
      labels: this.labels,
      command: [
        '--store=tikv',
        `--path=${pdAddressList}`,
        '--host=0.0.0.0',
        `-P=${ports.tidb}`,
        `--advertise-address=${primary.internalIp}`,
        `--status=${ports.tidbStatus}`,
      ],
    }));
    this.components.push({
      provider: primary.provider,
      container: tidb,
      role: 'tidb',
    });

    this.client = await primary.provider.createContainer(containerOptions({
      name: `${this.runId}-client`,
      image: images.client,
      resources: resources.client,
      labels: this.labels,
      command: ['sleep', 'infinity'],
    }));
    this.components.push({
      provider: primary.provider,
      container: this.client,
      role: 'client',
    });
    await this.waitReady();
    return this;
  }

  async waitReady() {
    const primary = this.hosts[ZERO];
    const deadline = Date.now() + this.config.readyTimeoutMs;
    let lastError = null;
    while (Date.now() < deadline) {
      try {
        const result = await primary.provider.execInContainer(
          this.client.containerId,
          mysqlCommand(this.config.ports.tidb, 'SELECT 1'),
        );
        if (result.exitCode === ZERO && String(result.stdout).trim() === '1') {
          return;
        }
        lastError = new Error(
          String(result.stderr || result.stdout || 'not ready'),
        );
      } catch (error) {
        lastError = error;
      }
      await sleep(this.config.readyPollMs);
    }
    throw new Error(
      'TiDB reference topology did not become SQL-ready: ' +
      String(lastError?.message || lastError || 'unknown'),
    );
  }

  async executeSql(sql) {
    const primary = this.hosts[ZERO];
    const result = await primary.provider.execInContainer(
      this.client.containerId,
      mysqlCommand(this.config.ports.tidb, sql),
    );
    if (result.exitCode !== ZERO) {
      throw new Error(`TiDB SQL failed: ${String(result.stderr || '').trim()}`);
    }
    return String(result.stdout || '').trim();
  }

  topologyIdentity() {
    return {
      database: 'TiDB',
      storage: 'TiKV',
      requestedImages: {...this.config.images},
      imageIds: {...this.imageIds},
      hosts: this.hosts.map((host) => ({
        comparatorIndex: host.index,
        internalIp: host.internalIp,
      })),
      ports: {...this.config.ports},
      coprocessorV2: {...this.config.coprocessorV2},
    };
  }

  async stop() {
    for (let index = this.components.length - 1; index >= ZERO; index -= 1) {
      const component = this.components[index];
      await removeContainerQuietly(component.provider, component.container);
    }
    this.components.length = ZERO;
    this.client = null;
  }
}

async function withTiDbReferenceRuntime(cluster, scenarioName, callback) {
  const runtime = new TiDbReferenceRuntime(cluster, scenarioName);
  try {
    await runtime.start();
    return await callback(runtime);
  } finally {
    await runtime.stop();
  }
}

export {
  DEFAULT_IMAGES,
  TiDbReferenceRuntime,
  resolveRuntimeConfig,
  withTiDbReferenceRuntime,
};
