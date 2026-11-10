// Single package-release error and manifest/outcome vocabulary, delegated by the release owner.


const PACKAGE_NAME = 'lagrange-server';
const REGISTRY_URL = 'https://registry.npmjs.org/';
const RELEASE_ERROR_NAME = 'NpmReleaseError';
const PUBLIC_ACCESS = 'public';
const MANIFEST_ERROR = Object.freeze({
  LOCK_VERSION: 'package-lock.json root version must match package.json',
  MAIN: 'package.json main must expose src/public-api.js',
  EXPORT: 'package.json root export must expose src/public-api.js',
  LAGRANGE_BIN: 'package.json must retain the lagrange executable',
  ADMIN_BIN: 'package.json must retain the lagrange-admin executable',
  FILES: 'package.json files must explicitly include src/',
  WIT_FILES: 'package.json files must explicitly include wit/',
  COMPONENTIZE_DEP:
    'package.json dependencies must include @bytecodealliance/componentize-js',
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
  // npm publish exited 0 and the registry still does not hold the version:
  // the one outcome whose only explanation is in npm's own output.
  PUBLISH_EXITED_WITHOUT_VERSION: 'PUBLISH_EXITED_WITHOUT_VERSION',
  // npm accepted the publish and said it is still processing; the
  // observation window expired before the version became visible. Not a
  // refusal and not a silent non-publication: the registry was still working.
  PUBLISH_ACCEPTED_PENDING_AVAILABILITY: 'PUBLISH_ACCEPTED_PENDING_AVAILABILITY',
});

class NpmReleaseError extends Error {
  constructor(code, message, cause = undefined) {
    super(message, {cause});
    this.code = code;
    this.name = RELEASE_ERROR_NAME;
  }
}

export {PACKAGE_NAME, REGISTRY_URL, PUBLIC_ACCESS, MANIFEST_ERROR, RELEASE_OUTCOME,
  NpmReleaseError};
