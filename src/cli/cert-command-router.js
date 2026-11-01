/**
 * CLI router for `lagrange cert` (`init-ca | issue-node | rotate | status`) and
 * `lagrange cluster` (`init | join | token`) PKI and enrollment commands (D2).
 *
 * Writes private keys with `0o600` permissions and certificates with `0o644`
 * permissions.
 *
 * @module cli/cert-command-router
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  generateClusterRootCa,
  generateEd25519KeyPairPem,
  issueNodeCertificate,
  verifyNodeCertificate,
} from '../transport/x509-ed25519-certificate-authority.js';
import {
  ClusterJoinTokenStore,
  createEnrollmentCsrProof,
  parseJoinToken,
} from '../transport/cluster-join-token.js';

const CERT_CLI_COMMAND = Object.freeze({
  CERT: 'cert',
  CLUSTER: 'cluster',
});

const CERT_SUBCOMMAND = Object.freeze({
  INIT_CA: 'init-ca',
  ISSUE_NODE: 'issue-node',
  ROTATE: 'rotate',
  STATUS: 'status',
});

const CLUSTER_SUBCOMMAND = Object.freeze({
  INIT: 'init',
  JOIN: 'join',
  TOKEN: 'token',
});

const CERT_CLI_EXIT_CODE = Object.freeze({
  OK: 0,
  USAGE: 2,
  ERROR: 1,
});

const CERT_FILE_MODE = Object.freeze({
  PRIVATE_KEY: 0o600,
  PUBLIC_CERT: 0o644,
  DIR_DEFAULT: 0o700,
});

const CERT_FILE_NAMES = Object.freeze({
  CA_CERT: 'ca.crt',
  CA_KEY: 'ca.key',
  UTF8: 'utf8',
  DEFAULT_SEED_NODE_ID: 'node-1',
  FLAG_PREFIX: '--',
  TOKEN_ACTION_CREATE: 'create',
  TOKEN_ACTION_REVOKE: 'revoke',
  FLAG_TOKEN_ID: 'token-id',
  FLAG_TTL_MS: 'ttl-ms',
  FLAG_MAX_USES: 'max-uses',
  MSG_INIT_CA_USAGE:
    'cert init-ca requires --cluster-id <id> and --out-dir <dir>',
  MSG_STATUS_USAGE: 'cert status requires --cert <path>',
  MSG_CLUSTER_INIT_USAGE:
    'cluster init requires --cluster-id <id> and --out-dir <dir>',
  MSG_CLUSTER_JOIN_USAGE:
    'cluster join requires --join-token <token>, --node-id <id>, and --out-dir <dir>',
  MSG_CLUSTER_TOKEN_USAGE:
    'cluster token create requires --cluster-id, --ca-cert, and --ca-key (or an active tokenStore)',
});

function parseFlags(args) {
  const flags = {};
  const positionals = [];
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token.startsWith(CERT_FILE_NAMES.FLAG_PREFIX)) {
      const key = token.slice(2);
      const next = args[i + 1];
      if (
        next !== undefined &&
        !next.startsWith(CERT_FILE_NAMES.FLAG_PREFIX)
      ) {
        flags[key] = next;
        i += 1;
      } else {
        flags[key] = true;
      }
    } else {
      positionals.push(token);
    }
  }
  return {flags, positionals};
}

function writePrivateKeyFile(filePath, pemContent) {
  fs.mkdirSync(path.dirname(filePath), {
    recursive: true,
    mode: CERT_FILE_MODE.DIR_DEFAULT,
  });
  fs.writeFileSync(filePath, pemContent, {
    encoding: CERT_FILE_NAMES.UTF8,
    mode: CERT_FILE_MODE.PRIVATE_KEY,
  });
  fs.chmodSync(filePath, CERT_FILE_MODE.PRIVATE_KEY);
}

function writePublicCertFile(filePath, pemContent) {
  fs.mkdirSync(path.dirname(filePath), {
    recursive: true,
    mode: CERT_FILE_MODE.DIR_DEFAULT,
  });
  fs.writeFileSync(filePath, pemContent, {
    encoding: CERT_FILE_NAMES.UTF8,
    mode: CERT_FILE_MODE.PUBLIC_CERT,
  });
  fs.chmodSync(filePath, CERT_FILE_MODE.PUBLIC_CERT);
}

function handleCertInitCa(flags) {
  const clusterId = flags['cluster-id'];
  const outDir = flags['out-dir'];
  if (typeof clusterId !== 'string' || typeof outDir !== 'string') {
    return {
      exitCode: CERT_CLI_EXIT_CODE.USAGE,
      error: CERT_FILE_NAMES.MSG_INIT_CA_USAGE,
    };
  }
  const ca = generateClusterRootCa({clusterId});
  const caCertPath = path.join(outDir, CERT_FILE_NAMES.CA_CERT);
  const caKeyPath = path.join(outDir, CERT_FILE_NAMES.CA_KEY);
  writePublicCertFile(caCertPath, ca.caCertPem);
  writePrivateKeyFile(caKeyPath, ca.caKeyPem);
  return {
    exitCode: CERT_CLI_EXIT_CODE.OK,
    clusterId: ca.clusterId,
    caCertPath,
    caKeyPath,
    serialNumber: ca.serialNumber,
    fingerprint256: ca.fingerprint256,
  };
}

function handleCertIssueOrRotate(flags, isRotate = false) {
  const caCertPath = flags['ca-cert'];
  const caKeyPath = flags['ca-key'];
  const clusterId = flags['cluster-id'];
  const nodeId = flags['node-id'];
  const outDir = flags['out-dir'];
  if (
    typeof caCertPath !== 'string' ||
    typeof caKeyPath !== 'string' ||
    typeof clusterId !== 'string' ||
    typeof nodeId !== 'string' ||
    typeof outDir !== 'string'
  ) {
    const cmdName = isRotate ?
      CERT_SUBCOMMAND.ROTATE :
      CERT_SUBCOMMAND.ISSUE_NODE;
    return {
      exitCode: CERT_CLI_EXIT_CODE.USAGE,
      error: `cert ${cmdName} requires --ca-cert, --ca-key, --cluster-id, --node-id, and --out-dir`,
    };
  }
  const caCertPem = fs.readFileSync(caCertPath, CERT_FILE_NAMES.UTF8);
  const caKeyPem = fs.readFileSync(caKeyPath, CERT_FILE_NAMES.UTF8);
  const issued = issueNodeCertificate({
    caCertPem,
    caKeyPem,
    clusterId,
    nodeId,
  });
  const certPath = path.join(outDir, `${nodeId}.crt`);
  const keyPath = path.join(outDir, `${nodeId}.key`);
  writePublicCertFile(certPath, issued.certPem);
  writePrivateKeyFile(keyPath, issued.keyPem);
  return {
    exitCode: CERT_CLI_EXIT_CODE.OK,
    rotated: isRotate,
    clusterId: issued.clusterId,
    nodeId: issued.nodeId,
    sanUri: issued.sanUri,
    certPath,
    keyPath,
    serialNumber: issued.serialNumber,
    fingerprint256: issued.fingerprint256,
    validTo: issued.validTo,
  };
}

function handleCertStatus(flags) {
  const certPath = flags.cert;
  if (typeof certPath !== 'string') {
    return {
      exitCode: CERT_CLI_EXIT_CODE.USAGE,
      error: CERT_FILE_NAMES.MSG_STATUS_USAGE,
    };
  }
  const certPem = fs.readFileSync(certPath, CERT_FILE_NAMES.UTF8);
  const caCertPems =
    typeof flags['ca-cert'] === 'string' ?
      [fs.readFileSync(flags['ca-cert'], CERT_FILE_NAMES.UTF8)] :
      [certPem];
  const verification = verifyNodeCertificate({
    certPemOrDer: certPem,
    caCertPems,
    expectedClusterId:
      typeof flags['cluster-id'] === 'string' ? flags['cluster-id'] : null,
    expectedNodeId:
      typeof flags['node-id'] === 'string' ? flags['node-id'] : null,
  });
  return {
    exitCode: verification.valid ?
      CERT_CLI_EXIT_CODE.OK :
      CERT_CLI_EXIT_CODE.ERROR,
    ...verification,
  };
}

function handleClusterInit(flags) {
  const clusterId = flags['cluster-id'];
  const outDir = flags['out-dir'];
  const nodeId =
    typeof flags['node-id'] === 'string' ?
      flags['node-id'] :
      CERT_FILE_NAMES.DEFAULT_SEED_NODE_ID;
  if (typeof clusterId !== 'string' || typeof outDir !== 'string') {
    return {
      exitCode: CERT_CLI_EXIT_CODE.USAGE,
      error: CERT_FILE_NAMES.MSG_CLUSTER_INIT_USAGE,
    };
  }
  const caResult = handleCertInitCa({'cluster-id': clusterId, 'out-dir': outDir});
  const nodeResult = handleCertIssueOrRotate({
    'ca-cert': caResult.caCertPath,
    'ca-key': caResult.caKeyPath,
    'cluster-id': clusterId,
    'node-id': nodeId,
    'out-dir': outDir,
  });
  const caCertPem = fs.readFileSync(caResult.caCertPath, CERT_FILE_NAMES.UTF8);
  const caKeyPem = fs.readFileSync(caResult.caKeyPath, CERT_FILE_NAMES.UTF8);
  const tokenStore = new ClusterJoinTokenStore({
    clusterId,
    caCertPem,
    caKeyPem,
  });
  const minted = tokenStore.mintJoinToken({singleUse: true});
  return {
    exitCode: CERT_CLI_EXIT_CODE.OK,
    clusterId,
    nodeId,
    caCertPath: caResult.caCertPath,
    caKeyPath: caResult.caKeyPath,
    nodeCertPath: nodeResult.certPath,
    nodeKeyPath: nodeResult.keyPath,
    joinToken: minted.token,
    tokenStore,
  };
}

function handleClusterJoin(flags, options = {}) {
  const joinToken = flags['join-token'];
  const nodeId = flags['node-id'];
  const outDir = flags['out-dir'];
  if (
    typeof joinToken !== 'string' ||
    typeof nodeId !== 'string' ||
    typeof outDir !== 'string'
  ) {
    return {
      exitCode: CERT_CLI_EXIT_CODE.USAGE,
      error: CERT_FILE_NAMES.MSG_CLUSTER_JOIN_USAGE,
    };
  }
  const parsed = parseJoinToken(joinToken);
  const keys = generateEd25519KeyPairPem();
  const keyPath = path.join(outDir, `${nodeId}.key`);
  writePrivateKeyFile(keyPath, keys.privateKeyPem);

  const csrProof = createEnrollmentCsrProof({
    clusterId: parsed.clusterId,
    nodeId,
    tokenId: parsed.tokenId,
    publicKeyPem: keys.publicKeyPem,
    privateKeyPem: keys.privateKeyPem,
  });

  if (options.tokenStore) {
    const enrolled = options.tokenStore.enrollNodeWithJoinToken({
      joinToken,
      csrProof,
    });
    const certPath = path.join(outDir, `${nodeId}.crt`);
    const caCertPath = path.join(outDir, CERT_FILE_NAMES.CA_CERT);
    writePublicCertFile(certPath, enrolled.certPem);
    writePublicCertFile(caCertPath, enrolled.caCertPem);
    return {
      exitCode: CERT_CLI_EXIT_CODE.OK,
      clusterId: enrolled.clusterId,
      nodeId: enrolled.nodeId,
      sanUri: enrolled.sanUri,
      certPath,
      keyPath,
      caCertPath,
      serialNumber: enrolled.serialNumber,
    };
  }

  return {
    exitCode: CERT_CLI_EXIT_CODE.OK,
    clusterId: parsed.clusterId,
    nodeId,
    keyPath,
    csrProof,
  };
}

function buildMintTokenOptions(flags) {
  const maxUsesFlag = flags[CERT_FILE_NAMES.FLAG_MAX_USES];
  const ttlMsFlag = flags[CERT_FILE_NAMES.FLAG_TTL_MS];
  return {
    ttlMs: ttlMsFlag ? Number(ttlMsFlag) : undefined,
    singleUse: !maxUsesFlag,
    maxUses: maxUsesFlag ? Number(maxUsesFlag) : 1,
  };
}

function handleClusterToken(positionals, flags, options = {}) {
  const action = positionals[2] || CERT_FILE_NAMES.TOKEN_ACTION_CREATE;
  const tokenIdFlag = flags[CERT_FILE_NAMES.FLAG_TOKEN_ID];
  if (
    action === CERT_FILE_NAMES.TOKEN_ACTION_REVOKE &&
    options.tokenStore &&
    tokenIdFlag
  ) {
    const revoked = options.tokenStore.revokeJoinToken(tokenIdFlag);
    return {
      exitCode: revoked ? CERT_CLI_EXIT_CODE.OK : CERT_CLI_EXIT_CODE.ERROR,
      revoked,
      tokenId: tokenIdFlag,
    };
  }
  const mintOpts = buildMintTokenOptions(flags);
  if (options.tokenStore) {
    return {
      exitCode: CERT_CLI_EXIT_CODE.OK,
      ...options.tokenStore.mintJoinToken(mintOpts),
    };
  }
  const clusterId = flags['cluster-id'];
  const caCertPath = flags['ca-cert'];
  const caKeyPath = flags['ca-key'];
  if (!clusterId || !caCertPath || !caKeyPath) {
    return {
      exitCode: CERT_CLI_EXIT_CODE.USAGE,
      error: CERT_FILE_NAMES.MSG_CLUSTER_TOKEN_USAGE,
    };
  }
  const caCertPem = fs.readFileSync(caCertPath, CERT_FILE_NAMES.UTF8);
  const caKeyPem = fs.readFileSync(caKeyPath, CERT_FILE_NAMES.UTF8);
  const store = new ClusterJoinTokenStore({clusterId, caCertPem, caKeyPem});
  return {
    exitCode: CERT_CLI_EXIT_CODE.OK,
    ...store.mintJoinToken(mintOpts),
    tokenStore: store,
  };
}

function dispatchCertGroupSubcommand(subcommand, flags) {
  if (subcommand === CERT_SUBCOMMAND.INIT_CA) {
    return handleCertInitCa(flags);
  }
  if (subcommand === CERT_SUBCOMMAND.ISSUE_NODE) {
    return handleCertIssueOrRotate(flags, false);
  }
  if (subcommand === CERT_SUBCOMMAND.ROTATE) {
    return handleCertIssueOrRotate(flags, true);
  }
  if (subcommand === CERT_SUBCOMMAND.STATUS) {
    return handleCertStatus(flags);
  }
  return {
    exitCode: CERT_CLI_EXIT_CODE.USAGE,
    error: `Unknown cert subcommand '${subcommand || ''}'`,
  };
}

function dispatchClusterGroupSubcommand(subcommand, positionals, flags, options) {
  if (subcommand === CLUSTER_SUBCOMMAND.INIT) {
    return handleClusterInit(flags);
  }
  if (subcommand === CLUSTER_SUBCOMMAND.JOIN) {
    return handleClusterJoin(flags, options);
  }
  if (subcommand === CLUSTER_SUBCOMMAND.TOKEN) {
    return handleClusterToken(positionals, flags, options);
  }
  return {
    exitCode: CERT_CLI_EXIT_CODE.USAGE,
    error: `Unknown cluster subcommand '${subcommand || ''}'`,
  };
}

function runCertOrClusterCommand(argv = [], options = {}) {
  const {flags, positionals} = parseFlags(argv);
  const group = positionals[0];
  const subcommand = positionals[1];

  try {
    if (group === CERT_CLI_COMMAND.CERT) {
      return dispatchCertGroupSubcommand(subcommand, flags);
    }
    if (group === CERT_CLI_COMMAND.CLUSTER) {
      return dispatchClusterGroupSubcommand(
        subcommand,
        positionals,
        flags,
        options,
      );
    }
    return {
      exitCode: CERT_CLI_EXIT_CODE.USAGE,
      error: `Expected 'cert' or 'cluster' command, got '${group || ''}'`,
    };
  } catch (err) {
    return {
      exitCode: CERT_CLI_EXIT_CODE.ERROR,
      error: err.message,
      code: err.code || null,
    };
  }
}

export {
  CERT_CLI_COMMAND,
  CERT_SUBCOMMAND,
  CLUSTER_SUBCOMMAND,
  CERT_CLI_EXIT_CODE,
  CERT_FILE_MODE,
  runCertOrClusterCommand,
};
