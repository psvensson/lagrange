// A mechanical census of the earlier raft-logic spike already in the tree:
// which checks it actually drove, and whether any of it ever touched Raft
// membership.
//
// Both are derived from the spike's own sources so the account of it cannot
// quietly disagree with what it did.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {parse} from 'espree';
import {KEYS} from 'eslint-visitor-keys';

const SPIKE = Object.freeze({
  RUNNER: 'scripts/run-raft-logic-investigation-spike.js',
  SOURCE_DIRS: Object.freeze(['src/raft/spike', 'test/raft/spike']),
  CHECK_PROPERTY: 'check',
  RUN_CHECK_CALLEE: 'runCheck',
  UTF8: 'utf8',
  FILE_SUFFIX: '.js',
  // The vocabulary a configuration change is written in, whatever the
  // spelling. If none of it appears anywhere in the spike, the spike never
  // changed membership.
  MEMBERSHIP_VOCABULARY:
    /conf_?change|confstate|conf_state|add_?node|remove_?node|add_?learner|promote|membership|voters/iu,
});

const NODE_TYPE = Object.freeze({
  ARRAY: 'ArrayExpression',
  CALL: 'CallExpression',
  IDENTIFIER: 'Identifier',
  LITERAL: 'Literal',
  OBJECT: 'ObjectExpression',
  PROPERTY: 'Property',
  VARIABLE_DECLARATOR: 'VariableDeclarator',
});

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function walk(node, visit) {
  if (!node || typeof node.type !== 'string') {
    return;
  }
  visit(node);
  for (const key of KEYS[node.type] || []) {
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        walk(child, visit);
      }
    } else if (value && typeof value.type === 'string') {
      walk(value, visit);
    }
  }
}

function stringConstants(tree) {
  const constants = new Map();
  walk(tree, (node) => {
    if (node.type === NODE_TYPE.VARIABLE_DECLARATOR &&
        node.id?.type === NODE_TYPE.IDENTIFIER &&
        node.init?.type === NODE_TYPE.LITERAL &&
        typeof node.init.value === 'string') {
      constants.set(node.id.name, node.init.value);
    }
  });
  return constants;
}

function resolveName(node, constants) {
  if (node?.type === NODE_TYPE.LITERAL && typeof node.value === 'string') {
    return node.value;
  }
  if (node?.type === NODE_TYPE.IDENTIFIER && constants.has(node.name)) {
    return constants.get(node.name);
  }
  return null;
}

/**
 * The checks the spike runner records, taken from its own source.
 * @return {Array<string>} sorted check names
 */
function spikeCheckNames() {
  const absolute = path.join(repositoryRoot, SPIKE.RUNNER);
  const tree = parse(
    fs.readFileSync(absolute, SPIKE.UTF8).replace(/^#!.*\n/u, '\n'),
    {ecmaVersion: 'latest', sourceType: 'module'});
  const constants = stringConstants(tree);
  const names = new Set();
  const addName = (candidate) => {
    const name = resolveName(candidate, constants);
    if (name) {
      names.add(name);
    }
  };
  const visitObject = (node) => {
    for (const property of node.properties) {
      if (property.type === NODE_TYPE.PROPERTY &&
          property.key?.name === SPIKE.CHECK_PROPERTY) {
        addName(property.value);
      }
    }
  };
  const isRunCheck = (node) => node.type === NODE_TYPE.CALL &&
    node.callee?.type === NODE_TYPE.IDENTIFIER &&
    node.callee.name === SPIKE.RUN_CHECK_CALLEE;
  walk(tree, (node) => {
    if (node.type === NODE_TYPE.OBJECT) {
      visitObject(node);
    } else if (isRunCheck(node)) {
      addName(node.arguments?.[0]);
    }
  });
  return [...names].sort();
}

/**
 * Every place in the spike's own sources where configuration-change
 * vocabulary appears. An empty result is the measured form of "the spike
 * never changed membership".
 * @return {Array<string>} `file:line` sites
 */
function spikeMembershipSites() {
  const sites = [];
  const files = [path.join(repositoryRoot, SPIKE.RUNNER)];
  for (const directory of SPIKE.SOURCE_DIRS) {
    const absolute = path.join(repositoryRoot, directory);
    if (!fs.existsSync(absolute)) {
      continue;
    }
    for (const entry of fs.readdirSync(absolute)) {
      if (entry.endsWith(SPIKE.FILE_SUFFIX)) {
        files.push(path.join(absolute, entry));
      }
    }
  }
  for (const file of files) {
    const lines = fs.readFileSync(file, SPIKE.UTF8).split('\n');
    lines.forEach((line, index) => {
      if (SPIKE.MEMBERSHIP_VOCABULARY.test(line)) {
        sites.push(`${path.relative(repositoryRoot, file)}:${index + 1}`);
      }
    });
  }
  return sites;
}

export {
  spikeCheckNames,
  spikeMembershipSites,
};
