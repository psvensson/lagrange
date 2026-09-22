// Reading the SHAPE of a production module out of its source.
//
// A structural claim - "this path cannot reach a cache", "this validator is
// given no configuration" - is checked by parsing `src` rather than by
// reading it, so it stays true when the module changes. The helpers here are
// the parsing half of those claims and hold no opinion about what a shape
// should be; each test says that for itself.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {parse} from 'espree';
import {KEYS} from 'eslint-visitor-keys';

const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const TEXT_ENCODING = 'utf8';

/**
 * @param {string} source - JavaScript source text.
 * @return {Object} Its ESTree program.
 */
function parseModuleSource(source) {
  return parse(source, {ecmaVersion: 'latest', sourceType: 'module',
    loc: true});
}

/**
 * Parse one repository file.
 * @param {string} relativePath - Path from the repository root.
 * @return {Object} Its ESTree program.
 */
function parseRepositoryModule(relativePath) {
  return parseModuleSource(fs.readFileSync(
    path.join(REPOSITORY_ROOT, relativePath), TEXT_ENCODING));
}

/**
 * Visit every node of a tree.
 * @param {Object} node - Where to start.
 * @param {Function} visit - Called with each node.
 */
function walkTree(node, visit) {
  if (!node || typeof node.type !== 'string') {
    return;
  }
  visit(node);
  for (const key of KEYS[node.type] || []) {
    const value = node[key];
    if (Array.isArray(value)) {
      value.forEach((child) => walkTree(child, visit));
    } else if (value && typeof value.type === 'string') {
      walkTree(value, visit);
    }
  }
}

/**
 * The names a named function destructures out of its one argument bag.
 * @param {Object} tree - A parsed module.
 * @param {string} functionName - The declaration to look at.
 * @return {Array<string>} The parameter names.
 */
function parameterNamesOf(tree, functionName) {
  const names = [];
  walkTree(tree, (node) => {
    if (node.type !== 'FunctionDeclaration' ||
      node.id?.name !== functionName) {
      return;
    }
    for (const parameter of node.params) {
      const pattern = parameter.type === 'AssignmentPattern' ?
        parameter.left : parameter;
      assert.equal(pattern.type, 'ObjectPattern',
        `${functionName} must take one named bag of inputs`);
      for (const property of pattern.properties) {
        names.push(property.key?.name ?? property.argument?.name);
      }
    }
  });
  return names;
}

/**
 * Every identifier and string literal that appears inside a class body.
 * @param {Object} tree - A parsed module.
 * @param {string} className - The class to look at.
 * @return {Set<string>} The names it mentions.
 */
function namesInsideClass(tree, className) {
  const found = new Set();
  walkTree(tree, (node) => {
    if (node.type !== 'ClassDeclaration' || node.id?.name !== className) {
      return;
    }
    walkTree(node.body, (inner) => {
      if (inner.type === 'Identifier') {
        found.add(inner.name);
      }
      if (inner.type === 'Literal' && typeof inner.value === 'string') {
        found.add(inner.value);
      }
    });
  });
  return found;
}

export {
  namesInsideClass,
  parameterNamesOf,
  parseRepositoryModule,
};
