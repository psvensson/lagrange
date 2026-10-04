/**
 * Shared docker-node deployment of the code-first account-summary WASI
 * service through the service pipeline owner (generate -> build -> deploy).
 *
 * The built local OCI layout lives under the scenario-artifacts bind mount
 * (SCENARIO_ARTIFACTS), so every node container reads it at the container
 * path; the deploy replays the generated records into the grammar ingress
 * (INSTALL SERVICE / CREATE BINDING / CONFIGURE SERVICE ACCESS) over the one
 * channel production admits for service-lifecycle SQL: an authenticated
 * PostgreSQL-wire session (the engine refuses lifecycle SQL without a
 * canonical security context, which only the PG-wire adapter sets; the
 * harness admin lane carries none). The listener is sys-postgres-wire,
 * scaled up through its documented operator path
 * (public-seam-durability-client.js provisionPublicListener).
 *
 * Used by public-path-multinode-baseline and public-seam-durability.
 */

import {copyFile, mkdir, readFile, rm, symlink} from 'node:fs/promises';
import path from 'node:path';
import {
  runBuild,
  runDeploy,
  runGenerate,
} from '../../../src/cli/service-pipeline-command.js';
import {
  ServiceLocalOciLayoutBuilder,
} from '../../../src/service/service-local-oci-layout-builder.js';
import {SCENARIO_ARTIFACTS} from '../harness/constants.js';
import {
  classifyPublicOutcome,
  describePublicError,
  discoverPublicEndpoints,
  openPgPublicClient,
} from './public-seam-durability-client.js';
import {
  PUBLIC_SEAM_INTERIM_RETRY_POLICY,
  PUBLIC_SEAM_OUTCOME_CLASS,
} from './public-seam-durability-constants.js';

// The service module is copied two levels below the artifacts root so its
// relative `../../src/...` imports resolve through the src symlink placed
// at the artifacts root (see prepareServiceProject).
const PROJECT_SUBDIR = 'project';
const SOURCE_SYMLINK_NAME = 'src';
const SERVICE_MODULE_FILE = 'lagrange.service.js';
const SERVICE_MODULE_SOURCE = path.join(
  'examples', 'call-binding-account-summary', SERVICE_MODULE_FILE);
const MANIFEST_RELATIVE_PATH = path.join(
  '.lagrange', 'deployment', 'manifest.json');
const UTF8_ENCODING = 'utf8';
const ONE = 1;
// INSTALL SERVICE carries the deploy's idempotency key, so replaying it is
// safe; CREATE BINDING / CONFIGURE SERVICE ACCESS are never retried here.
const IDEMPOTENT_LIFECYCLE_STATEMENT = /^\s*INSTALL\b/iu;
const LIFECYCLE_LISTENER = Object.freeze({
  POLL_MS: 1000,
  TIMEOUT_MS: 120_000,
});

/**
 * Lay out a fresh project for the account-summary service under
 * `<artifacts root>/<scenarioSubdirectory>/project`.
 * @param {string} scenarioSubdirectory
 * @return {Promise<{artifactsRoot: string, projectDirectory: string}>}
 */
async function prepareServiceProject(scenarioSubdirectory) {
  const artifactsRoot = path.resolve(
    process.cwd(), SCENARIO_ARTIFACTS.HOST_RELATIVE_PATH);
  const scenarioDirectory = path.join(artifactsRoot, scenarioSubdirectory);
  const projectDirectory = path.join(scenarioDirectory, PROJECT_SUBDIR);
  await rm(scenarioDirectory, {force: true, recursive: true});
  await mkdir(projectDirectory, {recursive: true});
  // The service module imports ../../src/authoring/*; from
  // <root>/<subdir>/project/ that resolves to <root>/src, the symlink to
  // the repo source created here. The link target must be RELATIVE:
  // ComponentizeJS resolves imports inside a WASI preopen that rejects
  // absolute symlink targets as sandbox escapes (verified live).
  // Recreated every run so a checkout move can never leave a stale link.
  const sourceLink = path.join(artifactsRoot, SOURCE_SYMLINK_NAME);
  await rm(sourceLink, {force: true});
  await symlink(
    path.relative(
      artifactsRoot, path.resolve(process.cwd(), SOURCE_SYMLINK_NAME)),
    sourceLink);
  await copyFile(
    path.resolve(process.cwd(), SERVICE_MODULE_SOURCE),
    path.join(projectDirectory, SERVICE_MODULE_FILE),
  );
  return {artifactsRoot, projectDirectory};
}

async function readDeploymentManifest(projectDirectory) {
  return JSON.parse(await readFile(
    path.join(projectDirectory, MANIFEST_RELATIVE_PATH), UTF8_ENCODING));
}

/**
 * The pipeline owner's three commands, building into a local OCI layout.
 * @return {{runBuild: Function, runDeploy: Function, runGenerate: Function}}
 */
function createServicePipeline() {
  return {
    runBuild: (options) => runBuild({
      ...options,
      createLocalOciLayoutBuilder: () => new ServiceLocalOciLayoutBuilder(),
    }),
    runDeploy,
    runGenerate,
  };
}

function defaultSleep(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function resultRows(result) {
  if (Array.isArray(result)) {
    return result;
  }
  return Array.isArray(result?.rows) ? result.rows : [];
}

/**
 * Retry an idempotent lifecycle statement only on the interim retry-safe
 * outcome class (deferred, a retry-after hint, connection refused before
 * dispatch); every other outcome is the deploy's answer.
 * @return {Promise<*>}
 */
async function queryWithIdempotentRetry(rawClient, statement, parameters,
  sleep) {
  const policy = PUBLIC_SEAM_INTERIM_RETRY_POLICY;
  const retryable = IDEMPOTENT_LIFECYCLE_STATEMENT.test(statement);
  for (let attempt = ONE; ; attempt += ONE) {
    try {
      return await rawClient.query(statement, parameters);
    } catch (error) {
      const described = error?.publicOutcome ||
        describePublicError(error, policy);
      if (!retryable || attempt >= policy.maxAttempts ||
          classifyPublicOutcome(described, policy) !==
            PUBLIC_SEAM_OUTCOME_CLASS.RETRYABLE) {
        throw error;
      }
      await sleep(described.retryAfterMs ?? policy.delayMs);
    }
  }
}

/**
 * Open the service-lifecycle SQL client on an authenticated
 * PostgreSQL-wire session. Candidates are the healthy sys-postgres-wire
 * endpoint rows of `nodes` (the admin node first); an endpoint row is
 * placement intent, not a bound socket, so only a completed connect counts,
 * within one bounded window. The listener must already be requested
 * (provisionPublicListener), early enough for placement to ride out the
 * formation tail.
 * @param {Object} adminNode - Harness node handle (reads endpoint rows).
 * @param {Array<Object>} nodes - Harness node handles ({id, ip}).
 * @param {Object} [options] - discoverEndpoints, openClient, sleep,
 *   timeoutMs, pollMs (test seams; defaults are the real ones).
 * @return {Promise<{execute: Function, close: Function, nodeId: string,
 *   port: number}>}
 */
async function openLifecycleSqlClient(adminNode, nodes, options = {}) {
  const settings = {
    discover: options.discoverEndpoints || discoverPublicEndpoints,
    openClient: options.openClient || openPgPublicClient,
    pollMs: options.pollMs ?? LIFECYCLE_LISTENER.POLL_MS,
    sleep: options.sleep || defaultSleep,
    timeoutMs: options.timeoutMs ?? LIFECYCLE_LISTENER.TIMEOUT_MS,
  };
  const candidates = [adminNode,
    ...nodes.filter((node) => node.id !== adminNode.id)];
  const deadline = Date.now() + settings.timeoutMs;
  const attempt = {lastError: 'no healthy sys-postgres-wire endpoint row'};
  for (;;) {
    const opened = await connectFirstReachable(
      adminNode, candidates, settings, attempt);
    if (opened) {
      return opened;
    }
    if (Date.now() >= deadline) {
      throw new Error('no reachable authenticated PostgreSQL-wire listener ' +
        `for service-lifecycle SQL within ${settings.timeoutMs}ms: ` +
        attempt.lastError);
    }
    await settings.sleep(settings.pollMs);
  }
}

// One discovery pass: the first candidate endpoint that completes a
// connect, or null (the reason is kept in attempt.lastError).
async function connectFirstReachable(adminNode, candidates, settings,
  attempt) {
  let ports;
  try {
    ports = await settings.discover(adminNode);
  } catch (error) {
    attempt.lastError = error.message;
    return null;
  }
  for (const node of candidates) {
    for (const port of ports.get(node.id) || []) {
      try {
        const rawClient = await settings.openClient(node, port);
        return {
          close: () => rawClient.close(),
          execute: async (statement, parameters) => ({
            rows: resultRows(await queryWithIdempotentRetry(
              rawClient, statement, parameters, settings.sleep)),
          }),
          nodeId: node.id,
          port,
        };
      } catch (error) {
        attempt.lastError = `${node.id}:${port}: ${error.message}`;
      }
    }
  }
  return null;
}

/**
 * Deploy the generated records over an authenticated PostgreSQL-wire
 * session; the layout path is translated to the path the node containers
 * see through the scenario-artifacts bind mount.
 * @param {{adminNode: Object, nodes: Array<Object>, options: Object}} target
 *   - Where to open the lifecycle client (openLifecycleSqlClient arguments).
 * @param {{pipeline: Object, runId: string, writeOutput: Function}} deps
 * @param {{artifactsRoot: string, projectDirectory: string}} paths
 * @param {string} layoutPath - Host path of the built layout.
 * @return {Promise<Object>} The pipeline deploy result.
 */
async function deployThroughPipeline(target, deps, paths, layoutPath) {
  const containerLayoutPath = path.posix.join(
    SCENARIO_ARTIFACTS.CONTAINER_PATH,
    path.relative(paths.artifactsRoot, layoutPath)
      .split(path.sep).join(path.posix.sep),
  );
  const sqlClient = await openLifecycleSqlClient(
    target.adminNode, target.nodes, target.options);
  try {
    return await deps.pipeline.runDeploy({
      createSqlClient: () => sqlClient,
      idempotencyKey: deps.runId,
      layoutPath: containerLayoutPath,
      projectDirectory: paths.projectDirectory,
      writeOutput: deps.writeOutput,
    });
  } finally {
    await sqlClient.close();
  }
}

export {
  createServicePipeline,
  deployThroughPipeline,
  prepareServiceProject,
  readDeploymentManifest,
};
