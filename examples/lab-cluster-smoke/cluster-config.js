/**
 * Cluster configuration and specification generator for Lagrange lab smoke fixtures.
 *
 * Implements strict input validation, C1b port schema compliance, and explicit profile
 * discrimination between release-0.2.6-smoke and scenario-a-dev-formation.
 */

const PROFILE = Object.freeze({
  RELEASE_0_2_6_SMOKE: 'release-0.2.6-smoke',
  SCENARIO_A_DEV_FORMATION: 'scenario-a-dev-formation',
});

const RELEASE_0_2_6_SUT = Object.freeze({
  name: 'lagrange-server',
  version: '0.2.6',
  gitHead: 'a1e26f6de84433a3913c2ef855d1b787e926d7eb',
  tarballSha256: '742393020d9229215b1381a0f426ca7c45a19da04df7cd6202a63c73dbddfa74',
  tarballBytes: 4650101,
  tarballSha1: '72a2545f9f683605dd7970b2869e5bf92ccb43ab',
  tarballSha512: '+5xWivXPdkJt0KXW/0cjAn8q3fPSzD8z6IvMFiaFm5ZgrYIJXBMt6/QOWosjNvbDysEErfMmkwG7Fw53MPb2dw==',
});

const SCENARIO_A_GATE_FACTS = Object.freeze({
  coreHeadSha: '7f80bcb656e8b3cb5297cb3170b93b8dfeca3b03',
  requiredConsecutiveColdFormations: 3,
  semanticProofIdsImplemented: 33,
  semanticProofIdsExecutedLive: 3,
  semanticProofIdsRequired: 33,
  scenarioAGatesBypassed: false,
  comparable: false,
});

const DEFAULT_TIMINGS = Object.freeze({
  QUEUE_WINDOW_SECONDS: 300,
  START_WINDOW_SECONDS: 120,
  MAX_RUN_SECONDS: 660,
  STOP_GRACE_SECONDS: 10,
  OBSERVER_TIMEOUT_SECONDS: 630,
});

const DEFAULT_NODE22_PATH =
  '/home/peter/.nvm/versions/node/v22.23.2/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';

const DEFAULT_STABILITY = Object.freeze({
  WINDOW_MS: 10000,
  MIN_SAMPLES: 6,
  CADENCE_MS: 2000,
  MAX_INTER_SAMPLE_GAP_MS: 3000,
  OVERALL_TIMEOUT_MS: 600000,
});

const MIN_PORT = 1024;
const MAX_PORT = 65535;

/**
 * Validate that a port is an integer in the safe unprivileged range.
 * @param {*} port
 * @param {string} label
 */
function assertValidPort(port, label) {
  if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) {
    throw new Error(`${label} must be an integer between ${MIN_PORT} and ${MAX_PORT}`);
  }
}

/**
 * Validate port conflict rules across IPv4 declarations.
 * Two port declarations conflict if their port numbers match AND
 * either bind address matches or either side binds wildcard 0.0.0.0.
 * @param {Array<{name: string, address: string, port: number}>} ports
 */
function assertNoPortConflicts(ports) {
  for (let i = 0; i < ports.length; i += 1) {
    const first = ports[i];
    for (let j = i + 1; j < ports.length; j += 1) {
      const second = ports[j];
      if (first.port === second.port) {
        const wildcard = first.address === '0.0.0.0' || second.address === '0.0.0.0';
        if (wildcard || first.address === second.address) {
          throw new Error(
            `Port conflict detected between ${first.name} (${first.address}:${first.port}) ` +
            `and ${second.name} (${second.address}:${second.port})`,
          );
        }
      }
    }
  }
}

/**
 * Validate and normalize caller options for cluster configuration.
 * @param {Object} options
 * @return {Object}
 */
function validateClusterConfigOptions(options = {}) {
  const profile = options.profile || PROFILE.RELEASE_0_2_6_SMOKE;
  if (profile !== PROFILE.RELEASE_0_2_6_SMOKE && profile !== PROFILE.SCENARIO_A_DEV_FORMATION) {
    throw new Error(`Unsupported fixture profile: ${profile}`);
  }

  const defaultMemberCount = profile === PROFILE.SCENARIO_A_DEV_FORMATION ? 5 : 3;
  const memberCount = options.memberCount !== undefined ? options.memberCount : defaultMemberCount;
  if (memberCount !== 3 && memberCount !== 5) {
    throw new Error(`memberCount must be 3 or 5, received: ${memberCount}`);
  }

  const allowWildcardRestBind = options.allowWildcardRestBind === true;
  if (profile === PROFILE.RELEASE_0_2_6_SMOKE && !allowWildcardRestBind) {
    throw new Error('allowWildcardRestBind: true is required before emitting 0.0.0.0 REST bind');
  }

  const enablePg = options.enablePg === true;
  const basePort = options.basePort !== undefined ? options.basePort : 18080;
  assertValidPort(basePort, 'basePort');

  let pgPort = null;
  if (enablePg) {
    pgPort = options.pgPort !== undefined ? options.pgPort : 15432;
    assertValidPort(pgPort, 'pgPort');
  }

  const oltpComparison = options.oltpComparison === true;

  const defaultMaxRunSeconds = oltpComparison ? 660 : DEFAULT_TIMINGS.MAX_RUN_SECONDS;
  const defaultObserverTimeoutSeconds = oltpComparison ?
    630 :
    DEFAULT_TIMINGS.OBSERVER_TIMEOUT_SECONDS;
  const defaultOverallTimeoutMs = oltpComparison ?
    600000 :
    DEFAULT_STABILITY.OVERALL_TIMEOUT_MS;

  const queueWindowSeconds = options.queueWindowSeconds || DEFAULT_TIMINGS.QUEUE_WINDOW_SECONDS;
  const startWindowSeconds = options.startWindowSeconds || DEFAULT_TIMINGS.START_WINDOW_SECONDS;
  const maxRunSeconds = options.maxRunSeconds || defaultMaxRunSeconds;
  const stopGraceSeconds = options.stopGraceSeconds || DEFAULT_TIMINGS.STOP_GRACE_SECONDS;
  const observerTimeoutSeconds = options.observerTimeoutSeconds ||
    defaultObserverTimeoutSeconds;

  if (!Number.isInteger(queueWindowSeconds) || queueWindowSeconds <= 0) {
    throw new Error('queueWindowSeconds must be a positive integer');
  }
  if (!Number.isInteger(startWindowSeconds) || startWindowSeconds <= 0) {
    throw new Error('startWindowSeconds must be a positive integer');
  }
  if (!Number.isInteger(maxRunSeconds) || maxRunSeconds <= 0) {
    throw new Error('maxRunSeconds must be a positive integer');
  }
  if (!Number.isInteger(stopGraceSeconds) || stopGraceSeconds < 1 || stopGraceSeconds > 30) {
    throw new Error('stopGraceSeconds must be an integer between 1 and 30');
  }
  if (maxRunSeconds <= stopGraceSeconds) {
    throw new Error('maxRunSeconds must be strictly greater than stopGraceSeconds');
  }
  if (observerTimeoutSeconds > maxRunSeconds - stopGraceSeconds) {
    throw new Error('observerTimeoutSeconds must not exceed maxRunSeconds - stopGraceSeconds');
  }

  const windowMs = options.windowMs || DEFAULT_STABILITY.WINDOW_MS;
  const minSamples = options.minSamples || DEFAULT_STABILITY.MIN_SAMPLES;
  const cadenceMs = options.cadenceMs || DEFAULT_STABILITY.CADENCE_MS;
  const maxInterSampleGapMs = options.maxInterSampleGapMs ||
    DEFAULT_STABILITY.MAX_INTER_SAMPLE_GAP_MS;
  const overallTimeoutMs = options.overallTimeoutMs || defaultOverallTimeoutMs;
  if (overallTimeoutMs >= observerTimeoutSeconds * 1000) {
    throw new Error('overallTimeoutMs must be strictly less than observerTimeoutSeconds * 1000');
  }

  // Build member port declarations
  const members = [];
  const allDeclaredPorts = [];

  for (let i = 0; i < memberCount; i += 1) {
    const memberName = `node-${i + 1}`;
    let restPort;
    let adminWsPort;
    let transportWsPort;

    if (Array.isArray(options.members) && options.members[i]) {
      const explicit = options.members[i];
      restPort = explicit.restPort;
      adminWsPort = explicit.adminWsPort;
      transportWsPort = explicit.transportWsPort;
    } else {
      restPort = basePort + (i * 4);
      adminWsPort = basePort + (i * 4) + 1;
      transportWsPort = basePort + (i * 4) + 2;
    }

    assertValidPort(restPort, `${memberName} restPort`);
    assertValidPort(adminWsPort, `${memberName} adminWsPort`);
    assertValidPort(transportWsPort, `${memberName} transportWsPort`);

    allDeclaredPorts.push({name: `${memberName}:rest`, address: '0.0.0.0', port: restPort});
    allDeclaredPorts.push({name: `${memberName}:admin`, address: '127.0.0.1', port: adminWsPort});
    allDeclaredPorts.push({name: `${memberName}:transport`, address: '127.0.0.1', port: transportWsPort});

    members.push({
      name: memberName,
      restPort,
      adminWsPort,
      transportWsPort,
    });
  }

  if (enablePg) {
    allDeclaredPorts.push({name: 'auxiliary:pg-smoke', address: '127.0.0.1', port: pgPort});
  }

  assertNoPortConflicts(allDeclaredPorts);

  return {
    profile,
    memberCount,
    allowWildcardRestBind,
    enablePg,
    pgPort,
    oltpComparison,
    members,
    queueWindowSeconds,
    startWindowSeconds,
    maxRunSeconds,
    stopGraceSeconds,
    observerTimeoutSeconds,
    windowMs,
    minSamples,
    cadenceMs,
    maxInterSampleGapMs,
    overallTimeoutMs,
  };
}

/**
 * Build deterministic setup spec for Lab v3 process-cluster worker staging.
 *
 * @param {string[]} memberNames
 * @param {number} startWindowSeconds
 * @return {{argv: string[], env: {PATH: string}, cwd: string, timeoutSeconds: number}}
 */
function buildDefaultSetupSpec(memberNames, startWindowSeconds) {
  const memberList = memberNames.join(' ');
  const memberStagingLines = memberNames.length > 0 ? [
    `for m in ${memberList}; do`,
    '  mkdir -p "../member-data/$m/member-data"',
    '  for item in src examples scripts test vendor package.json node_modules; do',
    '    if [ -e "$SRC/$item" ]; then',
    '      [ -e "../member-data/$m/$item" ] || ln -s "$SRC/$item" "../member-data/$m/$item"',
    '    fi',
    '  done',
    'done',
  ] : [];

  const setupScript = [
    'set -eu',
    'SRC="${LAB3_SOURCE_DIR:-$(pwd)}"',
    'if [ ! -e "$SRC/node_modules" ]; then',
    '  for cand in /mnt/data/peter/projects/lagrange/node_modules /home/peter/projects/lagrange/node_modules /home/peter/projects/lagrange-main/node_modules; do',
    '    if [ -d "$cand" ]; then',
    '      ln -s "$cand" "$SRC/node_modules"',
    '      break',
    '    fi',
    '  done',
    '  if [ ! -e "$SRC/node_modules" ]; then',
    '    (cd "$SRC" && npm ci --omit=dev --no-audit --no-fund)',
    '  fi',
    'fi',
    'for item in src examples scripts test vendor package.json node_modules; do',
    '  if [ -e "$SRC/$item" ]; then',
    '    [ -e "$item" ] || ln -s "$SRC/$item" "$item"',
    '  fi',
    'done',
    ...memberStagingLines,
  ].join('\n');

  return {
    argv: ['/bin/sh', '-c', setupScript],
    env: {PATH: DEFAULT_NODE22_PATH},
    cwd: 'run',
    timeoutSeconds: Math.min(30, startWindowSeconds),
  };
}

/**
 * Generate C1b process-cluster specification and fixture metadata.
 * @param {Object} options
 * @return {{spec: Object, fixtureMetadata: Object}}
 */
function generateClusterSpec(options = {}) {
  const normalized = validateClusterConfigOptions(options);
  const seedRestPort = normalized.members[0].restPort;

  const specMembers = normalized.members.map((member, index) => {
    // Exact 5-key port objects conforming to C1b schema
    const ports = [
      {
        name: 'rest',
        address: '0.0.0.0',
        connectAddress: '127.0.0.1',
        protocol: 'tcp',
        port: member.restPort,
      },
      {
        name: 'admin',
        address: '127.0.0.1',
        connectAddress: '127.0.0.1',
        protocol: 'tcp',
        port: member.adminWsPort,
      },
      {
        name: 'transport',
        address: '127.0.0.1',
        connectAddress: '127.0.0.1',
        protocol: 'tcp',
        port: member.transportWsPort,
      },
    ];

    const env = {
      PATH: DEFAULT_NODE22_PATH,
      NODE_ADDRESS: `127.0.0.1:${member.restPort}`,
      REST_API_PORT: String(member.restPort),
      ADMIN_WS_PORT: String(member.adminWsPort),
      TRANSPORT_WS_PORT: String(member.transportWsPort),
      ADMIN_WS_HOST: '127.0.0.1',
      TRANSPORT_WS_HOST: '127.0.0.1',
      DATA_DIR: 'member-data',
      MESSAGE_GROUP_REPLICA_COUNT: '3',
      PARTITION_DEFAULT_REPLICA_COUNT: '3',
      LOG_LEVEL: 'info',
    };

    let argv;
    if (index === 0) {
      argv = [
        'node',
        'src/sea-entry.js',
        '--data-dir',
        'member-data',
      ];
    } else {
      argv = [
        'node',
        'examples/lab-cluster-smoke/wait-seed.js',
        '--seed-livez-url',
        `http://127.0.0.1:${seedRestPort}/livez`,
        '--',
        'node',
        'src/sea-entry.js',
        '--data-dir',
        'member-data',
        '--seed',
        `127.0.0.1:${seedRestPort}`,
      ];
    }

    return {
      name: member.name,
      argv,
      env,
      cwd: 'member-data',
      ports,
    };
  });

  const auxiliaryPorts = normalized.enablePg ?
    [
      {
        name: 'pg-smoke',
        address: '127.0.0.1',
        connectAddress: '127.0.0.1',
        protocol: 'tcp',
        port: normalized.pgPort,
        owner: 'any-member',
        handoffAt: 'observer-start',
        requiredAt: 'observer-exit',
      },
    ] :
    [];

  const observerArgv = [
    'node',
    'examples/lab-cluster-smoke/observe-cluster.js',
    '--members-json',
    JSON.stringify(normalized.members),
    '--window-ms',
    String(normalized.windowMs),
    '--min-samples',
    String(normalized.minSamples),
    '--cadence-ms',
    String(normalized.cadenceMs),
    '--max-inter-sample-gap-ms',
    String(normalized.maxInterSampleGapMs),
    '--overall-timeout-ms',
    String(normalized.overallTimeoutMs),
  ];

  if (normalized.enablePg) {
    observerArgv.push(
      '--enable-pg',
      '--pg-port',
      String(normalized.pgPort),
    );
  }

  if (normalized.oltpComparison) {
    observerArgv.push('--oltp-comparison');
  }

  const spec = {
    protocol: 'lab3-process-cluster/v1',
    nodeCount: normalized.memberCount,
    queueWindowSeconds: normalized.queueWindowSeconds,
    startWindowSeconds: normalized.startWindowSeconds,
    maxRunSeconds: normalized.maxRunSeconds,
    stopGraceSeconds: normalized.stopGraceSeconds,
    completionMode: 'observer-exit',
    setup: options.setup === null ?
      null :
      (options.setup || buildDefaultSetupSpec(
        normalized.members.map((m) => m.name),
        normalized.startWindowSeconds,
      )),
    members: specMembers,
    auxiliaryPorts,
    observer: {
      argv: observerArgv,
      env: {PATH: DEFAULT_NODE22_PATH},
      cwd: 'run',
      timeoutSeconds: normalized.observerTimeoutSeconds,
    },
  };

  const fixtureMetadata = {
    profile: normalized.profile,
    sut: normalized.profile === PROFILE.RELEASE_0_2_6_SMOKE ?
      RELEASE_0_2_6_SUT :
      {coreHeadSha: SCENARIO_A_GATE_FACTS.coreHeadSha},
    scenarioAGateFacts: normalized.profile === PROFILE.SCENARIO_A_DEV_FORMATION ?
      SCENARIO_A_GATE_FACTS :
      null,
    sourceExecutionModel:
      'staged-source-tree-with-shared-or-installed-node-modules',
    tarballInstalledByFixture: false,
    allowWildcardRestBind: normalized.allowWildcardRestBind,
    logicalNodes: normalized.memberCount,
    physicalHosts: 1,
    failureDomains: 1,
    enablePg: normalized.enablePg,
    pgPort: normalized.pgPort,
    oltpComparison: normalized.oltpComparison,
    pgConfig: normalized.enablePg ?
      {
        host: '127.0.0.1',
        port: normalized.pgPort,
        authMode: 'trust',
        tlsMode: 'disable',
        replicaCount: 1,
      } :
      null,
    stabilityWindow: {
      windowMs: normalized.windowMs,
      minSamples: normalized.minSamples,
      cadenceMs: normalized.cadenceMs,
      maxInterSampleGapMs: normalized.maxInterSampleGapMs,
      overallTimeoutMs: normalized.overallTimeoutMs,
    },
  };

  return {spec, fixtureMetadata};
}

export {
  DEFAULT_NODE22_PATH,
  DEFAULT_STABILITY,
  DEFAULT_TIMINGS,
  PROFILE,
  RELEASE_0_2_6_SUT,
  SCENARIO_A_GATE_FACTS,
  assertNoPortConflicts,
  assertValidPort,
  buildDefaultSetupSpec,
  generateClusterSpec,
  validateClusterConfigOptions,
};
