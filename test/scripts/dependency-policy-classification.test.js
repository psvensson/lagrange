import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  DEPENDENCY_CLASS,
  classifyDependencySpecifier,
  isPackageSpecifier,
  packageNameOf,
} from '../../scripts/global-owner-debt-inventory/dependency-policy.js';

// Hermetic: the policy is supplied, so these assertions never depend on what
// happens to be installed in this checkout.
function policy({declared = [], optional = [], selfName = 'lagrange-server'} = {}) {
  return {
    declaredPackages: new Set(declared),
    optionalExternals: new Set(optional),
    selfName,
  };
}

test('a declared dependency classifies as declared', () => {
  assert.equal(
    classifyDependencySpecifier('tap', policy({declared: ['tap']})),
    DEPENDENCY_CLASS.declared);
  assert.equal(
    classifyDependencySpecifier('@bytecodealliance/jco', policy({
      declared: ['@bytecodealliance/jco'],
    })),
    DEPENDENCY_CLASS.declared);
});

test('a declared optional external classifies as optional-external', () => {
  const withPolicy = policy({optional: ['@pulumi/gcp']});
  assert.equal(
    classifyDependencySpecifier('@pulumi/gcp', withPolicy),
    DEPENDENCY_CLASS.optionalExternal);
});

test('the optional-external verdict does not depend on installation', () => {
  // The classifier is pure, so the same specifier and policy must yield the
  // same class regardless of any filesystem state. This is the property whose
  // absence let an ambient @pulumi/* change a committed digest.
  const withPolicy = policy({optional: ['@pulumi/gcp']});
  const verdicts = new Set(
    Array.from({length: 5},
      () => classifyDependencySpecifier('@pulumi/gcp', withPolicy)));
  assert.deepEqual([...verdicts], [DEPENDENCY_CLASS.optionalExternal]);
});

test('an undeclared package is illegal whether or not it could resolve', () => {
  // Legality is a property of the repository, not of node_modules: there is no
  // "installed" parameter here by design.
  assert.equal(
    classifyDependencySpecifier('left-pad', policy()),
    DEPENDENCY_CLASS.undeclared);
  assert.equal(
    classifyDependencySpecifier('@scope/whatever', policy({declared: ['tap']})),
    DEPENDENCY_CLASS.undeclared);
});

test('a package self-reference is accepted through the repository name', () => {
  assert.equal(
    classifyDependencySpecifier('lagrange-server', policy()),
    DEPENDENCY_CLASS.selfReference);
  assert.equal(
    classifyDependencySpecifier('lagrange-server/public-api', policy()),
    DEPENDENCY_CLASS.selfReference);
});

test('a scheme specifier is outside package policy entirely', () => {
  for (const specifier of ['lagrange:cell', 'wasi:io/streams', 'node:fs']) {
    assert.equal(classifyDependencySpecifier(specifier, policy()),
      DEPENDENCY_CLASS.scheme,
      `${specifier} carries a scheme and is not an npm package`);
  }
});

test('relative, absolute and subpath imports are not package specifiers', () => {
  for (const specifier of ['./local.js', '../up.js', '/abs/path.js', '#internal']) {
    assert.equal(isPackageSpecifier(specifier), false);
  }
});

test('scoped and unscoped package names are extracted correctly', () => {
  assert.equal(packageNameOf('tap'), 'tap');
  assert.equal(packageNameOf('tap/lib/thing.js'), 'tap');
  assert.equal(packageNameOf('@pulumi/gcp'), '@pulumi/gcp');
  assert.equal(packageNameOf('@pulumi/gcp/index.js'), '@pulumi/gcp');
});

test('an unrelated ambient package cannot enter the graph at all', () => {
  // Nothing imports it, so it is never classified; the only way a package
  // influences the graph is by being named in source.
  assert.equal(
    classifyDependencySpecifier('some-junk-nobody-imports', policy()),
    DEPENDENCY_CLASS.undeclared,
    'and if source DID import it, the verdict is a hard failure');
});
