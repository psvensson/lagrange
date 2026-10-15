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

function inspectWitHostSurface(source) {
  const {packageName, blocks} = readWitBlocks(source);
  const names = new Set();
  for (const block of blocks) {
    const id = `${block.kind}:${block.name}`;
    if (names.has(id)) throw new Error(`Duplicate WIT ${id}`);
    names.add(id);
  }

  const interfaces = blocks.filter((block) => block.kind === 'interface')
    .map((block) => {
      const functions = [...block.body.matchAll(
        /^[ \t]*([a-z][a-z0-9-]*):[ \t]*(func[^;]*);/gmu,
      )].map((match) => ({
        name: match[1],
        signature: match[2].replace(/\s+/gu, ' ').trim(),
      }));
      const functionCount = [...block.body.matchAll(/\bfunc\(/gu)].length;
      if (functions.length !== functionCount) {
        throw new Error(`Unparsed function in interface ${block.name}`);
      }
      if (new Set(functions.map((item) => item.name)).size !==
          functions.length) {
        throw new Error(`Duplicate function in interface ${block.name}`);
      }
      return {name: block.name, functions};
    });
  const interfaceNames = new Set(interfaces.map((item) => item.name));

  const worlds = blocks.filter((block) => block.kind === 'world')
    .map((block) => {
      const statements = [...block.body.matchAll(
        /^[ \t]*(import|export|use)[ \t]+([^;]+);/gmu,
      )];
      const remainder = block.body.replace(
        /^[ \t]*(?:import|export|use)[ \t]+[^;]+;/gmu, '',
      ).trim();
      if (remainder) {
        throw new Error(`Unrecognized world ${block.name}: ` +
          remainder.slice(0, 80));
      }
      const declaredImports = [];
      const exports = [];
      for (const [, kind, payload] of statements) {
        const value = payload.replace(/\s+/gu, ' ').trim();
        if (kind === 'import') {
          if (!interfaceNames.has(value)) {
            throw new Error(`World ${block.name} imports unknown: ${value}`);
          }
          if (declaredImports.includes(value)) {
            throw new Error(`Duplicate world import: ${value}`);
          }
          declaredImports.push(value);
        } else if (kind === 'export') {
          const match = /^([a-z][a-z0-9-]*):[ \t]*(func\(.*)$/u.exec(value);
          if (!match) {
            throw new Error(`Unrecognized world export: ${value}`);
          }
          if (exports.some((item) => item.name === match[1])) {
            throw new Error(`Duplicate world export: ${match[1]}`);
          }
          exports.push({name: match[1], signature: match[2]});
        }
      }
      return {name: block.name, declaredImports, exports};
    });
  return {
    source: 'wit/world.wit',
    package: packageName,
    interfaces,
    worlds,
  };
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
