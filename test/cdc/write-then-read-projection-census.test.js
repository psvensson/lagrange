/**
 * Census of the projection reads that today rely on the write path's cache
 * wait (quest replica-admission-from-committed-operation, attempt 2, design
 * note evidence/attempt2-write-answer-contract-delta.md section 4; lead
 * decision 2026-11-02).
 *
 * When a routed system-table write answers at commit, an owner that writes a
 * table and reads that same table back from its SystemTableCache no longer
 * finds its own write there by construction. Each such owner module must
 * wait explicitly for the write's position (awaitProjectionAt) - or be
 * reasoned to need no projection and listed below with the reason - before
 * the wait is deleted. Nothing may take a quieter path.
 *
 * Granularity: the owner module. At function scope no function both awaits
 * a mutation and reads the same table back (0 sites at 7486f64b0); the
 * dependence crosses methods of one owner (a writer method, a later
 * decision method), so the module is the unit a static census can decide.
 * A dependence across modules is not decidable statically; it is the
 * attempt's audit of each consumer listed in the design note, section 3.
 *
 * Parsed sources (espree), no grep: a module is a site when it calls a
 * system-table mutation naming table T and reads T from an expression naming
 * a cache (get / getAll / filter / has). Tables compare by name, not
 * spelling (TABLES.NODES, SYSTEM_TABLE_NAME.NODES and 'nodes' are one).
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as espree from 'espree';
import {test} from '../../src/test-helpers/tap.js';

const SRC_ROOT = fileURLToPath(new URL('../../src/', import.meta.url));
const MUTATION = /^(insert|update|upsert|delete)SystemTableRow(WithRetry)?$|^submitMutation$/u;
const CACHE_READS = new Set(['get', 'getAll', 'filter', 'has']);
const CACHE_NAME = /cache/iu;
const PROJECTION_WAIT = 'awaitProjectionAt';
// Sites reasoned to need no projection: `file:TABLE` -> reason.
// Empty: every listed site is owed an explicit wait or a reason here.
const NO_PROJECTION_NEEDED = Object.freeze({});

function sourceFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory)) {
    const file = path.join(directory, entry);
    if (fs.statSync(file).isDirectory()) {
      files.push(...sourceFiles(file));
    } else if (file.endsWith('.js')) {
      files.push(file);
    }
  }
  return files;
}

function walk(node, visit) {
  if (!node || typeof node.type !== 'string') return;
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'range') continue;
    if (Array.isArray(value)) {
      for (const child of value) walk(child, visit);
    } else if (value && typeof value.type === 'string') {
      walk(value, visit);
    }
  }
}

function memberCallName(node) {
  return node?.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' && !node.callee.computed ?
    node.callee.property.name : null;
}

function tableKey(source, node) {
  if (!node) return null;
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value.toUpperCase();
  }
  if (node.type === 'MemberExpression' && !node.computed) {
    return node.property.name.toUpperCase();
  }
  return source.slice(node.range[0], node.range[1]);
}

function mutationTable(source, call) {
  const [first] = call.arguments;
  if (memberCallName(call) === 'submitMutation' &&
      first?.type === 'ObjectExpression') {
    const property = first.properties.find((entry) =>
      entry.key?.name === 'tableName');
    return tableKey(source, property?.value);
  }
  return tableKey(source, first);
}

function census() {
  const sites = [];
  for (const file of sourceFiles(SRC_ROOT)) {
    const source = fs.readFileSync(file, 'utf8');
    if (!/SystemTableRow|submitMutation/u.test(source)) continue;
    const ast = espree.parse(source, {ecmaVersion: 'latest',
      sourceType: 'module', range: true});
    const written = new Set();
    const read = new Set();
    let waits = false;
    walk(ast, (node) => {
      const name = memberCallName(node) ??
        (node.type === 'CallExpression' && node.callee.type === 'Identifier' ?
          node.callee.name : null);
      if (name === null) return;
      if (name === PROJECTION_WAIT) waits = true;
      if (MUTATION.test(name)) {
        const table = mutationTable(source, node);
        if (table) written.add(table);
      }
      if (CACHE_READS.has(name) && CACHE_NAME.test(source.slice(
        node.callee.object.range[0], node.callee.object.range[1]))) {
        const table = tableKey(source, node.arguments[0]);
        if (table) read.add(table);
      }
    });
    for (const table of written) {
      if (read.has(table)) {
        sites.push({id: `${file.slice(SRC_ROOT.length)}:${table}`, waits});
      }
    }
  }
  return sites.sort((a, b) => a.id.localeCompare(b.id));
}

test('every owner that writes a table and reads it back from its cache ' +
  'waits for its write position (awaitProjectionAt) or is reasoned to need ' +
  'none', async (t) => {
  const sites = census();
  const owed = sites.filter((site) => !site.waits &&
    !Object.hasOwn(NO_PROJECTION_NEEDED, site.id)).map((site) => site.id);
  t.comment(`census: ${sites.length} site(s), ${owed.length} owed`);
  t.same(owed, [], 'no owner reads its own writes back from the cache ' +
    'without waiting for the write\'s position');
  t.same(Object.keys(NO_PROJECTION_NEEDED).filter((id) =>
    !sites.some((site) => site.id === id)), [],
  'every reasoned exemption names a live site');
});
