#!/usr/bin/env node

/**
 * Read-only, on-demand census of the canonical Lagrange host ABI.
 *
 * Do not hand-maintain a second host-interface grammar or SDK entitlement
 * table. This report is derived from wit/world.wit. A world listing imports
 * both contexts does not imply they are live in the same Binding mode.
 * WIT declares shapes, not current native OCI support, behavior or grants.
 *
 * This intentionally understands the sealed current WIT subset and rejects
 * unrecognized top-level/world syntax instead of silently omitting it.
 */

import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

function readWitBlocks(source) {
  const cleaned = source.split(/\r?\n/u)
    .map((line) => line.replace(/\/\/.*$/u, '')).join('\n');
  const blockPattern =
    /^(interface|world)[ \t]+([a-z][a-z0-9-]*)[ \t]*\{[^\n]*\n([\s\S]*?)^\}[ \t]*$/gmu;
  const blocks = [...cleaned.matchAll(blockPattern)].map((match) => ({
    kind: match[1],
    name: match[2],
    body: match[3],
  }));
  const remainder = cleaned.replace(blockPattern, '')
    .replace(/^[ \t]*package[ \t]+[^;\n]+;[ \t]*$/gmu, '').trim();
  if (remainder) {
    throw new Error(`Unrecognized top-level WIT: ${remainder.slice(0, 120)}`);
  }
  const packageName =
    /^[ \t]*package[ \t]+([^;\n]+);[ \t]*$/mu.exec(cleaned)?.[1];
  if (!packageName || blocks.length === 0) {
    throw new Error('Missing WIT package or top-level declarations');
  }
  return {packageName, blocks};
}

const TYPE_PATTERN =
  /^[ \t]*(record|variant|enum)[ \t]+([a-z][a-z0-9-]*)[ \t]*\{[ \t]*\n([\s\S]*?)^[ \t]*\}[ \t]*$/gmu;
const FUNCTION_PATTERN =
  /^[ \t]*([a-z][a-z0-9-]*):[ \t]*(func[^;]*);[ \t]*$/gmu;
const WORLD_STATEMENT_PATTERN =
  /^[ \t]*(import|export|use)[ \t]+([^;]+);[ \t]*$/gmu;
const USE_PATTERN =
  /^([a-z][a-z0-9-]*)\.\{([a-z][a-z0-9-]*(?:\s*,\s*[a-z][a-z0-9-]*)*)\}$/u;
const MEMBER_PATTERN = Object.freeze({
  record: /^([a-z][a-z0-9-]*):\s*(.+),$/u,
  variant: /^([a-z][a-z0-9-]*)(?:\(([^()]+)\))?,$/u,
  enum: /^([a-z][a-z0-9-]*),$/u,
});

function readTypeMembers(kind, body, typeName) {
  const members = body.split('\n').map((line) => line.trim())
    .filter(Boolean);
  if (members.length === 0) {
    throw new Error('Empty WIT type: ' + typeName);
  }
  const names = new Set();
  for (const member of members) {
    const match = MEMBER_PATTERN[kind].exec(member);
    if (!match || names.has(match[1])) {
      throw new Error('Unrecognized or repeated WIT type member: ' + typeName);
    }
    names.add(match[1]);
  }
  return members.map((member) => member.replace(/\s+/gu, ' '));
}

function readInterface(block) {
  const types = [...block.body.matchAll(TYPE_PATTERN)].map((match) => ({
    kind: match[1],
    name: match[2],
    members: readTypeMembers(match[1], match[3], match[2]),
  }));
  const withoutTypes = block.body.replace(TYPE_PATTERN, '');
  const functions = [...withoutTypes.matchAll(FUNCTION_PATTERN)].map(
    (match) => ({
      name: match[1],
      signature: match[2].replace(/\s+/gu, ' ').trim(),
    }));
  if (withoutTypes.replace(FUNCTION_PATTERN, '').trim() ||
      functions.length !== [...withoutTypes.matchAll(/\bfunc\(/gu)].length) {
    throw new Error('Unparsed declaration in WIT interface ' + block.name);
  }
  const names = [...types.map((entry) => entry.name),
    ...functions.map((entry) => entry.name)];
  if (new Set(names).size !== names.length) {
    throw new Error('Duplicate declaration in WIT interface ' + block.name);
  }
  return {name: block.name, types, functions};
}

function readWitUse(payload, worldName, interfaces) {
  const match = USE_PATTERN.exec(payload);
  if (!match) {
    throw new Error('Unrecognized WIT use declaration in ' +
      worldName + ': ' + payload);
  }
  const types = match[2].split(',').map((name) => name.trim());
  const iface = interfaces.get(match[1]);
  if (!iface || new Set(types).size !== types.length ||
      types.some((name) => !iface.types.some((item) => item.name === name))) {
    throw new Error('Unresolved WIT use declaration in ' +
      worldName + ': ' + payload);
  }
  return {interface: match[1], types};
}

function readWorld(block, interfaces) {
  const statements = [...block.body.matchAll(WORLD_STATEMENT_PATTERN)];
  if (block.body.replace(WORLD_STATEMENT_PATTERN, '').trim()) {
    throw new Error('Unparsed WIT world declaration: ' + block.name);
  }
  const declaredImports = [];
  const uses = [];
  const exports = [];
  for (const [, kind, raw] of statements) {
    const value = raw.replace(/\s+/gu, ' ').trim();
    if (kind === 'use') {
      uses.push(readWitUse(value, block.name, interfaces));
    } else if (kind === 'import') {
      if (!interfaces.has(value) || declaredImports.includes(value)) {
        throw new Error('Unknown or repeated WIT import in ' +
          block.name + ': ' + value);
      }
      declaredImports.push(value);
    } else if (kind === 'export') {
      const match = /^([a-z][a-z0-9-]*):\s*(func\(.*)$/u.exec(value);
      if (!match || exports.some((entry) => entry.name === match[1])) {
        throw new Error('Unrecognized or repeated WIT export: ' + value);
      }
      exports.push({name: match[1], signature: match[2]});
    } else {
      throw new Error('Unrecognized WIT statement kind: ' + kind);
    }
  }
  const used = uses.flatMap((entry) => entry.types);
  if (new Set(used).size !== used.length) {
    throw new Error('Repeated WIT type use in ' + block.name);
  }
  return {name: block.name, declaredImports, uses, exports};
}

function inspectWitHostSurface(source) {
  const {packageName, blocks} = readWitBlocks(source);
  const names = new Set();
  for (const block of blocks) {
    const id = block.kind + ':' + block.name;
    if (names.has(id)) throw new Error('Duplicate WIT ' + id);
    names.add(id);
  }
  const interfaces = blocks.filter((block) => block.kind === 'interface')
    .map(readInterface);
  const interfaceMap = new Map(interfaces.map((entry) => [entry.name, entry]));
  const worlds = blocks.filter((block) => block.kind === 'world')
    .map((block) => readWorld(block, interfaceMap));
  return {source: 'wit/world.wit', package: packageName, interfaces, worlds};
}

export {inspectWitHostSurface};

if (process.argv[1] &&
    resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const wit = readFileSync(new URL('../wit/world.wit', import.meta.url), 'utf8');
    const report = inspectWitHostSurface(wit);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`WIT host inventory refused: ${error.message}\n`);
    process.exitCode = 1;
  }
}
