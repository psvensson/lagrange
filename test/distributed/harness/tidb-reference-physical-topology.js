import {
  TIDB_REFERENCE_DEFAULTS,
  startTiDbReferenceCluster,
} from './tidb-reference-lifecycle.js';
import {
  createTiDbReferenceLifecycleResourceProvider,
} from './tidb-reference-lifecycle-resource-policy.js';

const ZERO = 0;
const ONE = 1;
const REQUIRED_STORAGE_HOSTS = 3;
const TYPE_FUNCTION = 'function';
const PHYSICAL_DEFAULTS = Object.freeze({
  pdClientPort: 8083,
  pdPeerPort: 8084,
  tidbPort: 8085,
  tidbStatusPort: 8086,
  tikvPort: 8090,
});

function normalizeHost(value, label) {
  const host = String(value || '').trim();
  if (!host) throw new Error(`${label} requires host`);
  return host;
}

function normalizePort(value, label) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < ONE || port > 65535) {
    throw new Error(`${label} requires a valid TCP port`);
  }
  return port;
}

function normalizePhysicalPorts(value = {}) {
  const ports = Object.freeze({
    pdClientPort: normalizePort(
      value.pdClientPort ?? PHYSICAL_DEFAULTS.pdClientPort,
      'TiDB physical pdClientPort',
    ),
    pdPeerPort: normalizePort(
      value.pdPeerPort ?? PHYSICAL_DEFAULTS.pdPeerPort,
      'TiDB physical pdPeerPort',
    ),
    tidbPort: normalizePort(
      value.tidbPort ?? PHYSICAL_DEFAULTS.tidbPort,
      'TiDB physical tidbPort',
    ),
    tidbStatusPort: normalizePort(
      value.tidbStatusPort ?? PHYSICAL_DEFAULTS.tidbStatusPort,
      'TiDB physical tidbStatusPort',
    ),
    tikvPort: normalizePort(
      value.tikvPort ?? PHYSICAL_DEFAULTS.tikvPort,
      'TiDB physical tikvPort',
    ),
  });
  const controlPorts = [
    ports.pdClientPort,
    ports.pdPeerPort,
    ports.tidbPort,
    ports.tidbStatusPort,
  ];
  if (new Set(controlPorts).size !== controlPorts.length) {
    throw new Error('TiDB physical control ports must be distinct');
  }
  return ports;
}

function assertProvider(provider, label) {
  if (!provider || typeof provider !== 'object') {
    throw new Error(`${label} requires provider`);
  }
  for (const method of [
    'createContainer',
    'inspectContainer',
    'execInContainer',
    'stopContainer',
    'removeContainer',
  ]) {
    if (typeof provider[method] !== TYPE_FUNCTION) {
      throw new Error(`${label} requires provider.${method}`);
    }
  }
}

function normalizePlacement(value, label) {
  assertProvider(value?.provider, label);
  return Object.freeze({
    provider: value.provider,
    host: normalizeHost(value.host, label),
  });
}

function normalizeTopology(options = {}) {
  const control = normalizePlacement(options.control, 'TiDB physical control');
  const storage = Array.isArray(options.storage) ?
    options.storage.map((placement, index) => normalizePlacement(
      placement,
      `TiDB physical storage ${index + ONE}`,
    )) :
    [];
  if (storage.length !== REQUIRED_STORAGE_HOSTS) {
    throw new Error(
      `TiDB physical topology requires exactly ${REQUIRED_STORAGE_HOSTS} ` +
      'storage hosts',
    );
  }

  const hosts = [control.host, ...storage.map(({host}) => host)];
  if (new Set(hosts).size !== hosts.length) {
    throw new Error('TiDB physical topology requires distinct physical hosts');
  }

  const providers = [control.provider, ...storage.map(({provider}) => provider)];
  if (new Set(providers).size !== providers.length) {
    throw new Error('TiDB physical topology requires distinct Docker providers');
  }

  const namePrefix = String(options.namePrefix || 'tidb-physical').trim();
  if (!namePrefix) throw new Error('TiDB physical topology requires namePrefix');

  return Object.freeze({
    control,
    storage: Object.freeze(storage),
    namePrefix,
    ports: normalizePhysicalPorts(options.ports),
  });
}

function withoutNetworkMode(hostConfigExtras = {}) {
  const {NetworkMode: _ignored, ...rest} = hostConfigExtras;
  return rest;
}

function replaceArgument(command, from, to) {
  if (!Array.isArray(command)) return command;
  return command.map((argument) => String(argument).replaceAll(from, to));
}

function replaceExactArgument(command, from, to) {
  if (!Array.isArray(command)) return command;
  return command.map((argument) => String(argument) === from ? to : argument);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function tikvIndex(namePrefix, name) {
  const match = String(name || '').match(
    new RegExp(`^${escapeRegExp(namePrefix)}-tikv-(\\d+)$`, 'u'),
  );
  if (!match) return null;
  const index = Number(match[1]) - ONE;
  return Number.isInteger(index) &&
    index >= ZERO &&
    index < REQUIRED_STORAGE_HOSTS ? index : null;
}

function resolveRole(topology, options) {
  const name = String(options?.name || '');
  const prefix = topology.namePrefix;
  if (name === `${prefix}-pd`) {
    return {kind: 'pd', placement: topology.control};
  }
  if (name === `${prefix}-tidb`) {
    return {kind: 'tidb', placement: topology.control};
  }
  if (name === `${prefix}-sql-readiness`) {
    return {kind: 'readiness', placement: topology.control};
  }
  const storeIndex = tikvIndex(prefix, name);
  if (storeIndex !== null) {
    return {
      kind: 'tikv',
      storeIndex,
      placement: topology.storage[storeIndex],
    };
  }
  throw new Error(`TiDB physical topology refused unknown container ${name}`);
}

function assertRoleImage(role, options) {
  const expected = role.kind === 'pd' ? TIDB_REFERENCE_DEFAULTS.pdImage :
    role.kind === 'tidb' ? TIDB_REFERENCE_DEFAULTS.tidbImage :
      role.kind === 'readiness' ? TIDB_REFERENCE_DEFAULTS.mysqlClientImage :
        TIDB_REFERENCE_DEFAULTS.tikvImage;
  if (options.image !== expected) {
    throw new Error(
      `TiDB physical topology ${role.kind} expected image ${expected}, got ` +
      `${options.image}`,
    );
  }
}

function rewritePdCommand(topology, command) {
  let rewritten = replaceArgument(
    command,
    `${topology.namePrefix}-pd`,
    topology.control.host,
  );
  rewritten = replaceArgument(
    rewritten,
    `:${TIDB_REFERENCE_DEFAULTS.pdClientPort}`,
    `:${topology.ports.pdClientPort}`,
  );
  return replaceArgument(
    rewritten,
    `:${TIDB_REFERENCE_DEFAULTS.pdPeerPort}`,
    `:${topology.ports.pdPeerPort}`,
  );
}

function rewriteTiKvCommand(topology, role, command) {
  const storeName = `${topology.namePrefix}-tikv-${role.storeIndex + ONE}`;
  let rewritten = replaceArgument(
    command,
    `${topology.namePrefix}-pd`,
    topology.control.host,
  );
  rewritten = replaceArgument(rewritten, storeName, role.placement.host);
  rewritten = replaceArgument(
    rewritten,
    `:${TIDB_REFERENCE_DEFAULTS.pdClientPort}`,
    `:${topology.ports.pdClientPort}`,
  );
  return replaceArgument(
    rewritten,
    `:${TIDB_REFERENCE_DEFAULTS.tikvPort}`,
    `:${topology.ports.tikvPort}`,
  );
}

function rewriteTiDbCommand(topology, command) {
  let rewritten = replaceArgument(
    command,
    `${topology.namePrefix}-pd`,
    topology.control.host,
  );
  rewritten = replaceArgument(
    rewritten,
    `:${TIDB_REFERENCE_DEFAULTS.pdClientPort}`,
    `:${topology.ports.pdClientPort}`,
  );
  rewritten = replaceExactArgument(
    rewritten,
    `-P=${TIDB_REFERENCE_DEFAULTS.tidbPort}`,
    `-P=${topology.ports.tidbPort}`,
  );
  return replaceExactArgument(
    rewritten,
    `--status=${TIDB_REFERENCE_DEFAULTS.tidbStatusPort}`,
    `--status=${topology.ports.tidbStatusPort}`,
  );
}

function rewriteCreateOptions(topology, role, options) {
  let command = options.command;
  if (role.kind === 'pd') command = rewritePdCommand(topology, command);
  if (role.kind === 'tidb') command = rewriteTiDbCommand(topology, command);
  if (role.kind === 'tikv') command = rewriteTiKvCommand(topology, role, command);

  return {
    ...options,
    network: 'host',
    hostNetwork: true,
    hostConfigExtras: withoutNetworkMode(options.hostConfigExtras),
    command,
  };
}

function createTiDbReferencePhysicalRoutingProvider(options = {}) {
  const topology = normalizeTopology(options);
  const owners = new Map();

  function ownerFor(containerId) {
    const owner = owners.get(containerId);
    if (!owner) {
      throw new Error(
        `TiDB physical topology has no owner for container ${containerId}`,
      );
    }
    return owner;
  }

  return {
    topology,
    async createContainer(containerOptions) {
      const role = resolveRole(topology, containerOptions);
      assertRoleImage(role, containerOptions);
      const rewritten = rewriteCreateOptions(topology, role, containerOptions);
      const created = await role.placement.provider.createContainer(rewritten);
      owners.set(created.containerId, {
        ...role,
        provider: role.placement.provider,
        host: role.placement.host,
      });
      return {
        ...created,
        physicalHost: role.placement.host,
      };
    },
    async inspectContainer(containerId) {
      return ownerFor(containerId).provider.inspectContainer(containerId);
    },
    async inspectContainerIfExists(containerId) {
      const owner = ownerFor(containerId);
      if (typeof owner.provider.inspectContainerIfExists !== TYPE_FUNCTION) {
        try {
          return await owner.provider.inspectContainer(containerId);
        } catch {
          return null;
        }
      }
      return owner.provider.inspectContainerIfExists(containerId);
    },
    async execInContainer(containerId, command) {
      const owner = ownerFor(containerId);
      let rewritten = command;
      if (owner.kind === 'readiness') {
        rewritten = replaceArgument(
          rewritten,
          `${topology.namePrefix}-tidb`,
          '127.0.0.1',
        );
        rewritten = replaceArgument(
          rewritten,
          `--port=${TIDB_REFERENCE_DEFAULTS.tidbPort}`,
          `--port=${topology.ports.tidbPort}`,
        );
      }
      return owner.provider.execInContainer(containerId, rewritten);
    },
    async stopContainer(containerId) {
      return ownerFor(containerId).provider.stopContainer(containerId);
    },
    async removeContainer(containerId) {
      const owner = ownerFor(containerId);
      try {
        return await owner.provider.removeContainer(containerId);
      } finally {
        owners.delete(containerId);
      }
    },
    async getContainerLogs(containerId, logOptions) {
      const owner = ownerFor(containerId);
      if (typeof owner.provider.getContainerLogs !== TYPE_FUNCTION) return '';
      return owner.provider.getContainerLogs(containerId, logOptions);
    },
    async getContainerStats(containerId) {
      const owner = ownerFor(containerId);
      if (typeof owner.provider.getContainerStats !== TYPE_FUNCTION) {
        throw new Error('TiDB physical provider lacks getContainerStats');
      }
      return owner.provider.getContainerStats(containerId);
    },
    async getContainerResourceSnapshot(containerId, storagePath = null) {
      const owner = ownerFor(containerId);
      if (typeof owner.provider.getContainerResourceSnapshot !== TYPE_FUNCTION) {
        throw new Error(
          'TiDB physical provider lacks getContainerResourceSnapshot',
        );
      }
      return owner.provider.getContainerResourceSnapshot(containerId, storagePath);
    },
    getPhysicalPlacement(containerId) {
      const owner = ownerFor(containerId);
      return Object.freeze({
        kind: owner.kind,
        storeIndex: owner.storeIndex ?? null,
        host: owner.host,
      });
    },
  };
}

async function startTiDbReferencePhysicalCluster(options = {}) {
  const topology = normalizeTopology(options);
  const routingProvider = createTiDbReferencePhysicalRoutingProvider(topology);
  const provider = createTiDbReferenceLifecycleResourceProvider(
    routingProvider,
    {tikvResourceLimits: options.tikvResourceLimits || null},
  );
  const cluster = await startTiDbReferenceCluster({
    provider,
    network: 'host',
    namePrefix: topology.namePrefix,
    tikvStoreCount: REQUIRED_STORAGE_HOSTS,
    resourceLimits: options.resourceLimits || {},
    readinessResourceLimits: options.readinessResourceLimits || {},
    readinessTimeoutMs: options.readinessTimeoutMs,
    readinessPollIntervalMs: options.readinessPollIntervalMs,
  });

  return {
    ...cluster,
    provider,
    physicalTopology: {
      controlHost: topology.control.host,
      storageHosts: topology.storage.map(({host}) => host),
      distinctSystemHosts: REQUIRED_STORAGE_HOSTS + ONE,
      ports: topology.ports,
    },
    endpoints: {
      ...cluster.endpoints,
      mysql: {
        host: topology.control.host,
        port: topology.ports.tidbPort,
      },
      pd: {
        host: topology.control.host,
        port: topology.ports.pdClientPort,
      },
      status: {
        host: topology.control.host,
        port: topology.ports.tidbStatusPort,
      },
    },
  };
}

export {
  PHYSICAL_DEFAULTS as TIDB_REFERENCE_PHYSICAL_DEFAULTS,
  REQUIRED_STORAGE_HOSTS as TIDB_REFERENCE_PHYSICAL_STORAGE_HOSTS,
  createTiDbReferencePhysicalRoutingProvider,
  startTiDbReferencePhysicalCluster,
};
