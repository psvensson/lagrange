/**
 * Shared docker-node deployment of the code-first account-summary WASI
 * service through the service pipeline owner (generate -> build -> deploy).
 *
 * The built local OCI layout lives under the scenario-artifacts bind mount
 * (SCENARIO_ARTIFACTS), so every node container reads it at the container
 * path; the deploy replays the generated records through the harness admin
 * lane into the same grammar ingress (INSTALL SERVICE / CREATE BINDING /
 * CONFIGURE SERVICE ACCESS).
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
import {queryRows} from './user-table-topology-helpers.js';

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

/**
 * Deploy the generated records; the layout path is translated to the path
 * the node containers see through the scenario-artifacts bind mount.
 * @param {Object} seedNode - Harness node handle (admin lane).
 * @param {{pipeline: Object, runId: string, writeOutput: Function}} deps
 * @param {{artifactsRoot: string, projectDirectory: string}} paths
 * @param {string} layoutPath - Host path of the built layout.
 * @return {Promise<Object>} The pipeline deploy result.
 */
async function deployThroughPipeline(seedNode, deps, paths, layoutPath) {
  const containerLayoutPath = path.posix.join(
    SCENARIO_ARTIFACTS.CONTAINER_PATH,
    path.relative(paths.artifactsRoot, layoutPath)
      .split(path.sep).join(path.posix.sep),
  );
  const sqlClient = {
    execute: async (statement, parameters) => ({
      rows: await queryRows(seedNode, statement, parameters),
    }),
  };
  return deps.pipeline.runDeploy({
    createSqlClient: () => sqlClient,
    idempotencyKey: deps.runId,
    layoutPath: containerLayoutPath,
    projectDirectory: paths.projectDirectory,
    writeOutput: deps.writeOutput,
  });
}

export {
  createServicePipeline,
  deployThroughPipeline,
  prepareServiceProject,
  readDeploymentManifest,
};
