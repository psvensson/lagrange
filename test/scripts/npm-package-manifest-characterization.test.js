import assert from 'node:assert/strict';
import {test} from 'node:test';
import {NpmReleaseError, validatePackageStructure} from '../../scripts/release-npm-package.js';

const PACKAGE = 'lagrange-server';
const VERSION = '0.4.0';
const CODE = 'PACKAGE_MANIFEST_INVALID';
const CHANGES = [
  ['package.json name must be lagrange-server', (manifest) => {
    manifest.name = PACKAGE;
  }],
  ['package-lock.json name must be lagrange-server', (_manifest, lock) => {
    lock.name = PACKAGE;
  }],
  ['package-lock.json root package name must be lagrange-server', (_manifest, lock) => {
    lock.packages[''].name = PACKAGE;
  }],
  ['package-lock.json root version must match package.json', (_manifest, lock) => {
    lock.packages[''].version = VERSION;
  }],
  ['package.json main must expose src/public-api.js', (manifest) => {
    manifest.main = 'src/public-api.js';
  }],
  ['package.json root export must expose src/public-api.js', (manifest) => {
    manifest.exports = {'.': './src/public-api.js'};
  }],
  ['package.json must retain the lagrange executable', (manifest) => {
    manifest.bin = {lagrange: './src/sea-entry.js'};
  }],
  ['package.json must retain the lagrange-admin executable', (manifest) => {
    manifest.bin['lagrange-admin'] = './src/cli/bin/lagrange-admin.js';
  }],
  ['package.json files must explicitly include src/', (manifest) => {
    manifest.files = ['src/'];
  }],
  ['package.json files must explicitly include wit/', (manifest) => {
    manifest.files.push('wit/');
  }],
  ['package.json dependencies must include @bytecodealliance/componentize-js', (manifest) => {
    manifest.dependencies = {'@bytecodealliance/componentize-js': 'fixture'};
  }],
];

test('simultaneous manifest defects retain the complete first-error order and public class', () => {
  const manifest = {version: VERSION};
  const lock = {packages: {'': {}}};
  for (const [message, repairFirstDefect] of CHANGES) {
    assert.throws(() => validatePackageStructure(manifest, lock), (error) => {
      assert.equal(Object.getPrototypeOf(error), NpmReleaseError.prototype);
      assert.equal(error.name, 'NpmReleaseError');
      assert.equal(error.code, CODE);
      assert.equal(error.message, message);
      assert.equal(error.cause, undefined);
      return true;
    });
    repairFirstDefect(manifest, lock);
  }
  assert.equal(validatePackageStructure(manifest, lock), undefined);
});

test('root-lock observation still precedes the first manifest predicate', () => {
  const original = new Error('root lock unavailable');
  const lock = {get packages() {
    throw original;
  }};
  assert.throws(() => validatePackageStructure({name: 'wrong'}, lock),
    (caught) => caught === original);
});
