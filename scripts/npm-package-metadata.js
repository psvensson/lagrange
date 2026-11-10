// Pure manifest predicates and pack-result parsing delegated by the release owner.
import {PACKAGE_NAME, REGISTRY_URL, PUBLIC_ACCESS,
  MANIFEST_ERROR, RELEASE_OUTCOME, NpmReleaseError} from './npm-release-contract.js';

const PACKAGE_ROOT_EXPORT = '.';
const PUBLIC_API_MAIN = 'src/public-api.js';
const PUBLIC_API_EXPORT = './src/public-api.js';
const LAGRANGE_BIN_PATH = './src/sea-entry.js';
const ADMIN_BIN_NAME = 'lagrange-admin';
const ADMIN_BIN_PATH = './src/cli/bin/lagrange-admin.js';
const PACKAGE_SOURCE_PATH = 'src/';
const PACKAGE_WIT_PATH = 'wit/';
const COMPONENTIZE_DEPENDENCY = '@bytecodealliance/componentize-js';
const DISTRIBUTED_SQL_KEYWORD = 'distributed-sql';

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
  assertManifestCondition(Array.isArray(packageJson.files) &&
    packageJson.files.includes(PACKAGE_WIT_PATH),
  MANIFEST_ERROR.WIT_FILES);
  assertManifestCondition(
    Boolean(packageJson.dependencies?.[COMPONENTIZE_DEPENDENCY]),
    MANIFEST_ERROR.COMPONENTIZE_DEP,
  );
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

export {assertManifestCondition, validatePackageStructure, validatePublicationMetadata,
  parsePackOutput};
