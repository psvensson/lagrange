#!/usr/bin/env node

import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename, dirname, join, resolve, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, '..');
const PACKAGE_NAME = 'lagrange-server';
const PRODUCT_NAME = 'lagrange';
const REGISTRY_URL = 'https://registry.npmjs.org/';
const COMMAND_TIMEOUT_MS = 120000;
const COMMAND_OUTPUT_MAX_BYTES = 16 * 1024 * 1024;
const REGISTRY_OBSERVATION_ATTEMPTS = 5;
const REGISTRY_OBSERVATION_DELAY_MS = 2000;
const NPM_COMMAND = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const TEXT_ENCODING = 'utf8';
const ARGUMENT_SEPARATOR = ' ';
const RELEASE_ERROR_NAME = 'NpmReleaseError';
const PACKAGE_ROOT_EXPORT = '.';
const PUBLIC_API_MAIN = 'src/public-api.js';
const PUBLIC_API_EXPORT = './src/public-api.js';
const LAGRANGE_BIN_PATH = './src/sea-entry.js';
const ADMIN_BIN_NAME = 'lagrange-admin';
const ADMIN_BIN_PATH = './src/cli/bin/lagrange-admin.js';
const PACKAGE_SOURCE_PATH = 'src/';
const DISTRIBUTED_SQL_KEYWORD = 'distributed-sql';
const PUBLIC_ACCESS = 'public';
const PACKAGE_JSON_FILENAME = 'package.json';
const CONSUMER_PACKAGE_NAME = 'lagrange-server-install-smoke';
const MODULE_PACKAGE_TYPE = 'module';
const TAR_COMMAND = 'tar';
const RELEASE_COMMAND = Object.freeze({
  VERIFY: 'verify',
  PUBLISH: 'publish',
});
const COMMAND_ARGUMENT = Object.freeze({
  TAR_EXTRACT_GZIP: '-xzf',
  TAR_DIRECTORY: '-C',
  NPM_INSTALL: 'install',
  NPM_NO_AUDIT: '--no-audit',
  NPM_NO_FUND: '--no-fund',
  NPM_NO_PACKAGE_LOCK: '--package-lock=false',
  NPM_CACHE: '--cache',
  NODE_MODULE_INPUT: '--input-type=module',
  NODE_EVAL: '--eval',
  OPTION_PREFIX: '--',
});
const HTTP = Object.freeze({
  CACHE_NO_STORE: 'no-store',
  CACHE_NO_CACHE: 'no-cache',
  CONTENT_TYPE_JSON: 'application/json',
  NOT_FOUND: 404,
});
const INSTALL_PATH_LABEL = Object.freeze({
  LAGRANGE: 'lagrange bin',
  ADMIN: 'lagrange-admin bin',
});
const MANIFEST_ERROR = Object.freeze({
  LOCK_VERSION: 'package-lock.json root version must match package.json',
  MAIN: 'package.json main must expose src/public-api.js',
  EXPORT: 'package.json root export must expose src/public-api.js',
  LAGRANGE_BIN: 'package.json must retain the lagrange executable',
  ADMIN_BIN: 'package.json must retain the lagrange-admin executable',
  FILES: 'package.json files must explicitly include src/',
  AUTHOR: 'package.json author must be non-empty',
  HOMEPAGE: 'package.json homepage must be non-empty',
  BUGS: 'package.json bugs.url must be non-empty',
  KEYWORDS: 'package.json keywords must identify the distributed SQL package',
  ACCESS: 'package.json publishConfig.access must be public',
  PROVENANCE: 'package.json publishConfig.provenance must be true',
  ONE_ARTIFACT: 'expected one packed artifact',
  PACKED_VERSION: 'packed artifact version must match package.json',
  GIT_HEAD: 'candidate tarball must contain a full gitHead',
});
const DRY_RUN_ERROR = 'installed lagrange --dry-run did not complete';
const CLI_USAGE =
  'usage: release-npm-package.js verify [--output DIR] [--git-head SHA] ' +
  'or publish --tarball FILE [--git-head SHA]';

const RELEASE_OUTCOME = Object.freeze({
  PACKAGE_VERIFIED: 'PACKAGE_VERIFIED',
  NAME_AVAILABLE: 'NAME_AVAILABLE',
  VERSION_ABSENT: 'VERSION_ABSENT',
  ALREADY_PUBLISHED_MATCH: 'ALREADY_PUBLISHED_MATCH',
  PUBLISHED_MATCH: 'PUBLISHED_MATCH',
  OCCUPIED_FOREIGN: 'OCCUPIED_FOREIGN',
  VERSION_CONTENT_CONFLICT: 'VERSION_CONTENT_CONFLICT',
  VERSION_COMMIT_CONFLICT: 'VERSION_COMMIT_CONFLICT',
  PACKAGE_MANIFEST_INVALID: 'PACKAGE_MANIFEST_INVALID',
  PACK_FAILED: 'PACK_FAILED',
  INSTALL_FAILED: 'INSTALL_FAILED',
  IMPORT_FAILED: 'IMPORT_FAILED',
  BIN_FAILED: 'BIN_FAILED',
  CLI_FAILED: 'CLI_FAILED',
  AUTH_UNAVAILABLE: 'AUTH_UNAVAILABLE',
  OWNERSHIP_DENIED: 'OWNERSHIP_DENIED',
  REGISTRY_UNAVAILABLE: 'REGISTRY_UNAVAILABLE',
  PUBLISH_FAILED: 'PUBLISH_FAILED',
  PARTIAL_RELEASE_CONFLICT: 'PARTIAL_RELEASE_CONFLICT',
});

class NpmReleaseError extends Error {
  constructor(code, message, cause = undefined) {
    super(message, {cause});
    this.code = code;
    this.name = RELEASE_ERROR_NAME;
  }
}

function commandFailureMessage(command, args, result) {
  return `${command} ${args.join(ARGUMENT_SEPARATOR)} failed with status ${result.status}` +
    `\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`;
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd || REPOSITORY_ROOT,
    encoding: TEXT_ENCODING,
    env: options.env || process.env,
    maxBuffer: COMMAND_OUTPUT_MAX_BYTES,
    timeout: options.timeout || COMMAND_TIMEOUT_MS,
  });
}

function runChecked(command, args, options = {}, errorCode = RELEASE_OUTCOME.PACK_FAILED) {
  const result = run(command, args, options);
  if (result.status !== 0) {
    throw new NpmReleaseError(
      errorCode,
      commandFailureMessage(command, args, result),
    );
  }
  return result.stdout;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, TEXT_ENCODING));
}

function assertManifestCondition(condition, message) {
  if (!condition) {
    throw new NpmReleaseError(
      RELEASE_OUTCOME.PACKAGE_MANIFEST_INVALID,
      message,
    );
  }
}

function validatePackageStructure(packageJson, packageLock) {
  const rootLock = packageLock.packages?.[''];
  assertManifestCondition(packageJson.name === PACKAGE_NAME,
    `package.json name must be ${PACKAGE_NAME}`);
  assertManifestCondition(packageLock.name === PACKAGE_NAME,
    `package-lock.json name must be ${PACKAGE_NAME}`);
  assertManifestCondition(rootLock?.name === PACKAGE_NAME,
    `package-lock.json root package name must be ${PACKAGE_NAME}`);
  assertManifestCondition(rootLock?.version === packageJson.version,
    MANIFEST_ERROR.LOCK_VERSION);
  assertManifestCondition(packageJson.main === PUBLIC_API_MAIN,
    MANIFEST_ERROR.MAIN);
  assertManifestCondition(
    packageJson.exports?.[PACKAGE_ROOT_EXPORT] === PUBLIC_API_EXPORT,
    MANIFEST_ERROR.EXPORT,
  );
  assertManifestCondition(packageJson.bin?.lagrange === LAGRANGE_BIN_PATH,
    MANIFEST_ERROR.LAGRANGE_BIN);
  assertManifestCondition(
    packageJson.bin?.[ADMIN_BIN_NAME] === ADMIN_BIN_PATH,
    MANIFEST_ERROR.ADMIN_BIN,
  );
  assertManifestCondition(Array.isArray(packageJson.files) &&
    packageJson.files.includes(PACKAGE_SOURCE_PATH),
  MANIFEST_ERROR.FILES);
}

function validatePublicationMetadata(packageJson) {
  assertManifestCondition(Boolean(packageJson.author),
    MANIFEST_ERROR.AUTHOR);
  assertManifestCondition(Boolean(packageJson.homepage),
    MANIFEST_ERROR.HOMEPAGE);
  assertManifestCondition(Boolean(packageJson.bugs?.url),
    MANIFEST_ERROR.BUGS);
  assertManifestCondition(packageJson.keywords?.includes(DISTRIBUTED_SQL_KEYWORD),
    MANIFEST_ERROR.KEYWORDS);
  assertManifestCondition(packageJson.publishConfig?.access === PUBLIC_ACCESS,
    MANIFEST_ERROR.ACCESS);
  assertManifestCondition(packageJson.publishConfig?.provenance === true,
    MANIFEST_ERROR.PROVENANCE);
  assertManifestCondition(packageJson.publishConfig?.registry === REGISTRY_URL,
    `package.json publishConfig.registry must be ${REGISTRY_URL}`);
}

async function validateWorkspaceManifest() {
  const packageJson = await readJson(join(REPOSITORY_ROOT, 'package.json'));
  const packageLock = await readJson(join(REPOSITORY_ROOT, 'package-lock.json'));
  validatePackageStructure(packageJson, packageLock);
  validatePublicationMetadata(packageJson);
  return packageJson;
}

function parsePackOutput(output) {
  try {
    const parsed = JSON.parse(output);
    if (!Array.isArray(parsed) || parsed.length !== 1) {
      throw new Error(MANIFEST_ERROR.ONE_ARTIFACT);
    }
    return parsed[0];
  } catch (error) {
    throw new NpmReleaseError(
      RELEASE_OUTCOME.PACK_FAILED,
      `npm pack did not return one JSON artifact: ${error.message}`,
      error,
    );
  }
}

function resolveGitHead(explicitGitHead) {
  const gitHead = explicitGitHead || runChecked(
    'git', ['rev-parse', 'HEAD'], {}, RELEASE_OUTCOME.PACK_FAILED,
  ).trim();
  if (!/^[0-9a-f]{40}$/u.test(gitHead)) {
    throw new NpmReleaseError(
      RELEASE_OUTCOME.PACKAGE_MANIFEST_INVALID,
      `git head must be a full 40-character commit hash, received ${gitHead}`,
    );
  }
  return gitHead;
}

async function buildNpmPackage(options = {}) {
  const packageJson = await validateWorkspaceManifest();
  const gitHead = resolveGitHead(options.gitHead);
  const outputDirectory = resolve(
    options.outputDirectory || join(REPOSITORY_ROOT, 'dist/npm'),
  );
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'lagrange-npm-pack-'));
  const preliminaryDirectory = join(temporaryRoot, 'preliminary');
  const stagingDirectory = join(temporaryRoot, 'staging');
  await Promise.all([
    mkdir(outputDirectory, {recursive: true}),
    mkdir(preliminaryDirectory),
    mkdir(stagingDirectory),
  ]);
  try {
    const preliminary = parsePackOutput(runChecked(NPM_COMMAND, [
      'pack',
      '--json',
      '--ignore-scripts',
      '--pack-destination',
      preliminaryDirectory,
    ]));
    const preliminaryTarball = join(preliminaryDirectory, preliminary.filename);
    const extractArguments = [
      COMMAND_ARGUMENT.TAR_EXTRACT_GZIP,
      preliminaryTarball,
      COMMAND_ARGUMENT.TAR_DIRECTORY,
      stagingDirectory,
    ];
    runChecked(TAR_COMMAND, extractArguments);
    const stagedPackageRoot = join(stagingDirectory, 'package');
    const stagedManifestPath = join(stagedPackageRoot, 'package.json');
    const stagedManifest = await readJson(stagedManifestPath);
    stagedManifest.gitHead = gitHead;
    await writeFile(
      stagedManifestPath,
      `${JSON.stringify(stagedManifest, null, 2)}\n`,
      TEXT_ENCODING,
    );
    const packed = parsePackOutput(runChecked(NPM_COMMAND, [
      'pack',
      '--json',
      '--ignore-scripts',
      '--pack-destination',
      outputDirectory,
    ], {cwd: stagedPackageRoot}));
    assertManifestCondition(packed.name === PACKAGE_NAME,
      `packed artifact name must be ${PACKAGE_NAME}`);
    assertManifestCondition(packed.version === packageJson.version,
      MANIFEST_ERROR.PACKED_VERSION);
    return {
      ...packed,
      gitHead,
      tarballPath: join(outputDirectory, packed.filename),
    };
  } finally {
    await rm(temporaryRoot, {recursive: true, force: true});
  }
}

function assertInstalledPath(actualPath, installedPackageRoot, label) {
  const expectedPrefix = `${installedPackageRoot}${sep}`;
  if (actualPath !== installedPackageRoot && !actualPath.startsWith(expectedPrefix)) {
    throw new NpmReleaseError(
      RELEASE_OUTCOME.IMPORT_FAILED,
      `${label} resolved outside the installed package: ${actualPath}`,
    );
  }
}

async function verifyInstalledPackage(packed) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'lagrange-npm-install-'));
  const installDirectory = join(temporaryRoot, 'consumer');
  const cacheDirectory = join(temporaryRoot, 'npm-cache');
  await Promise.all([
    mkdir(installDirectory),
    mkdir(cacheDirectory),
  ]);
  try {
    await writeFile(join(installDirectory, PACKAGE_JSON_FILENAME), `${JSON.stringify({
      name: CONSUMER_PACKAGE_NAME,
      private: true,
      type: MODULE_PACKAGE_TYPE,
    }, null, 2)}\n`, TEXT_ENCODING);
    const installArguments = [
      COMMAND_ARGUMENT.NPM_INSTALL,
      COMMAND_ARGUMENT.NPM_NO_AUDIT,
      COMMAND_ARGUMENT.NPM_NO_FUND,
      COMMAND_ARGUMENT.NPM_NO_PACKAGE_LOCK,
      COMMAND_ARGUMENT.NPM_CACHE,
      cacheDirectory,
      packed.tarballPath,
    ];
    runChecked(
      NPM_COMMAND,
      installArguments,
      {cwd: installDirectory},
      RELEASE_OUTCOME.INSTALL_FAILED,
    );
    const installedPackageRoot = await realpath(join(
      installDirectory, 'node_modules', PACKAGE_NAME,
    ));
    const resolutionScript = [
      'import {realpathSync} from \'node:fs\';',
      'import {sep} from \'node:path\';',
      'import {fileURLToPath, pathToFileURL} from \'node:url\';',
      `const root = realpathSync('node_modules/${PACKAGE_NAME}');`,
      `const resolved = realpathSync(fileURLToPath(import.meta.resolve('${PACKAGE_NAME}')));`,
      'if (resolved !== root && !resolved.startsWith(root + sep)) process.exit(10);',
      `const api = await import('${PACKAGE_NAME}');`,
      `if (api.VERSION !== '${packed.version}') process.exit(11);`,
      'const serviceUrl = pathToFileURL(root + \'/src/admin/admin-test-run-service.js\');',
      'const {AdminTestRunService} = await import(serviceUrl);',
      'const service = new AdminTestRunService();',
      'if (!(await service.readDashboardPage()).includes(\'<!doctype html>\')) process.exit(12);',
      'if (!(await service.readPlaybackViewer()).includes(\'<!doctype html>\')) process.exit(13);',
    ].join(' ');
    const resolutionArguments = [
      COMMAND_ARGUMENT.NODE_MODULE_INPUT,
      COMMAND_ARGUMENT.NODE_EVAL,
      resolutionScript,
    ];
    runChecked(
      process.execPath,
      resolutionArguments,
      {cwd: installDirectory},
      RELEASE_OUTCOME.IMPORT_FAILED,
    );
    const binDirectory = join(installDirectory, 'node_modules', '.bin');
    const lagrangeBin = join(binDirectory, 'lagrange');
    const adminBin = join(binDirectory, 'lagrange-admin');
    await Promise.all([access(lagrangeBin), access(adminBin)]);
    const [lagrangeTarget, adminTarget] = await Promise.all([
      realpath(lagrangeBin),
      realpath(adminBin),
    ]);
    assertInstalledPath(
      lagrangeTarget,
      installedPackageRoot,
      INSTALL_PATH_LABEL.LAGRANGE,
    );
    assertInstalledPath(
      adminTarget,
      installedPackageRoot,
      INSTALL_PATH_LABEL.ADMIN,
    );
    const versionOutput = runChecked(
      lagrangeBin,
      ['--version'],
      {cwd: installDirectory},
      RELEASE_OUTCOME.BIN_FAILED,
    ).trim();
    if (versionOutput !== `${PRODUCT_NAME} v${packed.version}`) {
      throw new NpmReleaseError(
        RELEASE_OUTCOME.BIN_FAILED,
        `unexpected lagrange --version output: ${versionOutput}`,
      );
    }
    const adminVersionOutput = runChecked(
      adminBin,
      ['--version'],
      {cwd: installDirectory},
      RELEASE_OUTCOME.BIN_FAILED,
    ).trim();
    if (adminVersionOutput !== `lagrange-admin version ${packed.version}`) {
      throw new NpmReleaseError(
        RELEASE_OUTCOME.BIN_FAILED,
        `unexpected lagrange-admin --version output: ${adminVersionOutput}`,
      );
    }
    const dryRunOutput = runChecked(lagrangeBin, [
      '--dry-run',
      '--data-dir',
      join(temporaryRoot, 'data'),
    ], {cwd: installDirectory}, RELEASE_OUTCOME.CLI_FAILED);
    if (!/Dry run completed/u.test(dryRunOutput)) {
      throw new NpmReleaseError(
        RELEASE_OUTCOME.CLI_FAILED,
        DRY_RUN_ERROR,
      );
    }
    return packed;
  } finally {
    await rm(temporaryRoot, {recursive: true, force: true});
  }
}

async function buildAndVerifyNpmPackage(options = {}) {
  const packed = await buildNpmPackage(options);
  await verifyInstalledPackage(packed);
  return packed;
}

async function inspectTarball(tarballPath) {
  const manifestText = runChecked(
    'tar',
    ['-xOf', resolve(tarballPath), 'package/package.json'],
    {},
    RELEASE_OUTCOME.PACK_FAILED,
  );
  const manifest = JSON.parse(manifestText);
  assertManifestCondition(manifest.name === PACKAGE_NAME,
    `candidate tarball name must be ${PACKAGE_NAME}`);
  assertManifestCondition(/^[0-9a-f]{40}$/u.test(manifest.gitHead || ''),
    MANIFEST_ERROR.GIT_HEAD);
  const contents = await readFile(resolve(tarballPath));
  const integrity = `sha512-${createHash('sha512').update(contents).digest('base64')}`;
  return {
    gitHead: manifest.gitHead,
    integrity,
    manifest,
    tarballPath: resolve(tarballPath),
  };
}

function normalizeRepositoryUrl(repository) {
  const raw = typeof repository === 'string' ? repository : repository?.url;
  return String(raw || '')
    .replace(/^git\+/u, '')
    .replace(/\.git$/u, '')
    .replace(/\/$/u, '');
}

function classifyRegistryState(candidate, registryMetadata) {
  if (!registryMetadata) {
    return RELEASE_OUTCOME.NAME_AVAILABLE;
  }
  const candidateRepository = normalizeRepositoryUrl(candidate.manifest.repository);
  const registryRepository = normalizeRepositoryUrl(registryMetadata.repository);
  if (!candidateRepository || candidateRepository !== registryRepository) {
    return RELEASE_OUTCOME.OCCUPIED_FOREIGN;
  }
  const publishedVersion = registryMetadata.versions?.[candidate.manifest.version];
  if (!publishedVersion) {
    return RELEASE_OUTCOME.VERSION_ABSENT;
  }
  if (publishedVersion.dist?.integrity !== candidate.integrity) {
    return RELEASE_OUTCOME.VERSION_CONTENT_CONFLICT;
  }
  if (publishedVersion.gitHead !== candidate.gitHead) {
    return RELEASE_OUTCOME.VERSION_COMMIT_CONFLICT;
  }
  return RELEASE_OUTCOME.ALREADY_PUBLISHED_MATCH;
}

async function readRegistryMetadata(packageName, registryUrl = REGISTRY_URL) {
  const packageUrl = new URL(encodeURIComponent(packageName), registryUrl);
  let response;
  try {
    const requestOptions = {
      cache: HTTP.CACHE_NO_STORE,
      headers: {
        'accept': HTTP.CONTENT_TYPE_JSON,
        'cache-control': HTTP.CACHE_NO_CACHE,
      },
    };
    response = await fetch(packageUrl, requestOptions);
  } catch (error) {
    throw new NpmReleaseError(
      RELEASE_OUTCOME.REGISTRY_UNAVAILABLE,
      `npm registry request failed: ${error.message}`,
      error,
    );
  }
  if (response.status === HTTP.NOT_FOUND) {
    return null;
  }
  if (!response.ok) {
    throw new NpmReleaseError(
      RELEASE_OUTCOME.REGISTRY_UNAVAILABLE,
      `npm registry returned HTTP ${response.status}`,
    );
  }
  return response.json();
}

function classifyPublishFailure(result) {
  const output = `${result.stdout}\n${result.stderr}`;
  if (/ENEEDAUTH|E401|Unable to authenticate/iu.test(output)) {
    return RELEASE_OUTCOME.AUTH_UNAVAILABLE;
  }
  if (/E403|forbidden|permission/iu.test(output)) {
    return RELEASE_OUTCOME.OWNERSHIP_DENIED;
  }
  return RELEASE_OUTCOME.PUBLISH_FAILED;
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function observePublishedCandidate(candidate) {
  let lastRegistryClassification = null;
  for (let attempt = 0; attempt < REGISTRY_OBSERVATION_ATTEMPTS; attempt += 1) {
    const metadata = await readRegistryMetadata(candidate.manifest.name);
    lastRegistryClassification = classifyRegistryState(candidate, metadata);
    if (lastRegistryClassification === RELEASE_OUTCOME.ALREADY_PUBLISHED_MATCH) {
      return RELEASE_OUTCOME.PUBLISHED_MATCH;
    }
    if (attempt < REGISTRY_OBSERVATION_ATTEMPTS - 1) {
      await delay(REGISTRY_OBSERVATION_DELAY_MS);
    }
  }
  throw new NpmReleaseError(
    RELEASE_OUTCOME.PARTIAL_RELEASE_CONFLICT,
    'published registry state did not match the candidate: ' +
      `${lastRegistryClassification}`,
  );
}

async function publishNpmPackage(tarballPath, expectedGitHead) {
  const candidate = await inspectTarball(tarballPath);
  if (expectedGitHead && candidate.gitHead !== expectedGitHead) {
    throw new NpmReleaseError(
      RELEASE_OUTCOME.PACKAGE_MANIFEST_INVALID,
      `candidate gitHead ${candidate.gitHead} does not match ${expectedGitHead}`,
    );
  }
  const metadata = await readRegistryMetadata(candidate.manifest.name);
  const existingState = classifyRegistryState(candidate, metadata);
  if (existingState === RELEASE_OUTCOME.ALREADY_PUBLISHED_MATCH) {
    return {outcome: existingState, candidate};
  }
  if (![RELEASE_OUTCOME.NAME_AVAILABLE, RELEASE_OUTCOME.VERSION_ABSENT]
    .includes(existingState)) {
    throw new NpmReleaseError(existingState,
      `npm registry rejected candidate preflight: ${existingState}`);
  }
  const publishResult = run(NPM_COMMAND, [
    'publish',
    candidate.tarballPath,
    '--access',
    'public',
    '--provenance',
    '--registry',
    REGISTRY_URL,
  ]);
  if (publishResult.status !== 0) {
    const code = classifyPublishFailure(publishResult);
    throw new NpmReleaseError(
      code,
      commandFailureMessage(
        NPM_COMMAND,
        [RELEASE_COMMAND.PUBLISH, basename(tarballPath)],
        publishResult,
      ),
    );
  }
  const outcome = await observePublishedCandidate(candidate);
  return {outcome, candidate};
}

function parseArguments(argv) {
  const [providedCommand, ...tokens] = argv;
  const command = providedCommand || RELEASE_COMMAND.VERIFY;
  const options = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith(COMMAND_ARGUMENT.OPTION_PREFIX) ||
      index + 1 >= tokens.length) {
      throw new NpmReleaseError(
        RELEASE_OUTCOME.PACKAGE_MANIFEST_INVALID,
        `invalid argument ${token}`,
      );
    }
    options[token.slice(2)] = tokens[index + 1];
    index += 1;
  }
  return {command, options};
}

async function main() {
  const {command, options} = parseArguments(process.argv.slice(2));
  if (command === RELEASE_COMMAND.VERIFY) {
    const packed = await buildAndVerifyNpmPackage({
      gitHead: options['git-head'],
      outputDirectory: options.output,
    });
    console.log(JSON.stringify({
      outcome: RELEASE_OUTCOME.PACKAGE_VERIFIED,
      name: packed.name,
      version: packed.version,
      filename: packed.filename,
      tarballPath: packed.tarballPath,
      size: packed.size,
      unpackedSize: packed.unpackedSize,
      entryCount: packed.entryCount,
      integrity: packed.integrity,
      gitHead: packed.gitHead,
    }, null, 2));
    return;
  }
  if (command === RELEASE_COMMAND.PUBLISH && options.tarball) {
    const result = await publishNpmPackage(
      options.tarball,
      options['git-head'],
    );
    console.log(JSON.stringify({
      outcome: result.outcome,
      name: result.candidate.manifest.name,
      version: result.candidate.manifest.version,
      integrity: result.candidate.integrity,
      gitHead: result.candidate.gitHead,
    }, null, 2));
    return;
  }
  throw new NpmReleaseError(
    RELEASE_OUTCOME.PACKAGE_MANIFEST_INVALID,
    CLI_USAGE,
  );
}

const isMainModule = process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMainModule) {
  main().catch((error) => {
    console.error(JSON.stringify({
      outcome: error.code || RELEASE_OUTCOME.PUBLISH_FAILED,
      message: error.message,
    }, null, 2));
    process.exitCode = 1;
  });
}

export {
  NpmReleaseError,
  PACKAGE_NAME,
  RELEASE_OUTCOME,
  buildAndVerifyNpmPackage,
  buildNpmPackage,
  classifyRegistryState,
  inspectTarball,
  normalizeRepositoryUrl,
  publishNpmPackage,
  validateWorkspaceManifest,
  verifyInstalledPackage,
};
