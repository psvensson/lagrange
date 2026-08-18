// Dependency legality for the canonical owner-debt import graph.
//
// The rule this module enforces exists because a package that merely happened
// to be installed on one machine silently changed a committed artifact: an
// undeclared @pulumi/* resolved there and nowhere else, so CI and every clean
// checkout disagreed with the committed digest identically.
//
// Meaning therefore comes from repository declarations and source syntax, never
// from the filesystem:
//
//   relative / absolute        -> ordinary module resolution
//   recognized scheme          -> external toolchain namespace, not a package
//   package self-reference     -> the repository's own exports
//   declared dependency        -> canonical package resolution
//   declared optional external -> retain the edge, never follow the target
//   any other bare package     -> FAIL, undeclared dependency
//
// Legality is deliberately independent of whether resolution succeeded. If it
// were not, the same illegal import would mean different things on two machines
// purely because one of them had the package installed.

import {
  OWNER_DEBT_DEPENDENCY_CLASS,
  OWNER_DEBT_PACKAGE_PATH_SEPARATOR,
  OWNER_DEBT_PACKAGE_SCOPE_PREFIX,
} from './constants.js';

export const DEPENDENCY_CLASS = OWNER_DEBT_DEPENDENCY_CLASS;

const SCHEME_SEPARATOR = ':';
const SCOPE_PREFIX = OWNER_DEBT_PACKAGE_SCOPE_PREFIX;
const PATH_SEPARATOR = OWNER_DEBT_PACKAGE_PATH_SEPARATOR;
const RELATIVE_PREFIX = '.';
const ABSOLUTE_PREFIX = '/';
const SUBPATH_IMPORT_PREFIX = '#';

// A component-model world import such as `lagrange:cell` carries a scheme and
// resolves through the WASM toolchain, so it is not an npm package at all.
// Excluding it structurally is correct; putting it on an allowlist would be a
// category error.
export function isPackageSpecifier(specifier) {
  if (typeof specifier !== 'string' || specifier.length === 0) return false;
  if (specifier.startsWith(RELATIVE_PREFIX)) return false;
  if (specifier.startsWith(ABSOLUTE_PREFIX)) return false;
  if (specifier.startsWith(SUBPATH_IMPORT_PREFIX)) return false;
  return !specifier.includes(SCHEME_SEPARATOR);
}

export function packageNameOf(specifier) {
  const segments = specifier.split(PATH_SEPARATOR);
  return specifier.startsWith(SCOPE_PREFIX) ?
    segments.slice(0, 2).join(PATH_SEPARATOR) : segments[0];
}

// Pure: the verdict depends only on the specifier and the repository's declared
// state, never on what is installed.
export function classifyDependencySpecifier(specifier, policy) {
  if (!isPackageSpecifier(specifier)) return DEPENDENCY_CLASS.scheme;
  const packageName = packageNameOf(specifier);
  if (packageName === policy.selfName) return DEPENDENCY_CLASS.selfReference;
  if (policy.optionalExternals.has(packageName)) {
    return DEPENDENCY_CLASS.optionalExternal;
  }
  if (policy.declaredPackages.has(packageName)) return DEPENDENCY_CLASS.declared;
  return DEPENDENCY_CLASS.undeclared;
}
