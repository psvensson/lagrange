#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {cruise} from 'dependency-cruiser';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = 'solve/changes/priority-recovery-owner-inventory/inventory.json';
const TARGET_NAME = /(?:priority-recovery|publication-recovery|recovery-protocol-publication)/u;
const PRESENTATION_OWNERS = new Set(['admin', 'diagnostics', 'query']);
const RAW_MARKER = /(?:observation|evidence|normaliz|context|values|bootstrap|errors)/u;
const OWNER_DECISION_MARKER = /(?:snapshot-actuation|state-machine|gate|planning|completion|assessment|intent|coordination|decision(?!-snapshot)|reentry|superseded|priority-spread|publication-boundary)/u;
const SNAPSHOT_MARKER = /(?:snapshot|state-machine|contract|constants|helpers|row-index)/u;
const AUTHORITY_EXPORT = /(?:snapshot|evidence|context|contract|state|outcome|build|normaliz|reduce|rebuild|resolve|assess|decide)/iu;
const LAYER_ORDER = Object.freeze({
  raw_observation: 0,
  canonical_snapshot_reducer: 1,
  owner_decision: 2,
  consumer_presentation: 3,
});

function sourceFiles(root) {
  const files = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(absolute);
      if (entry.isFile() && entry.name.endsWith('.js')) {
        const relative = path.relative(root, absolute).replaceAll(path.sep, '/');
        if (TARGET_NAME.test(relative)) files.push(relative);
      }
    }
  };
  visit(path.join(root, 'src'));
  return files.sort();
}

function classifyModule(file) {
  const parts = file.split('/');
  const owner = parts[1];
  const basename = path.basename(file, '.js');
  if (PRESENTATION_OWNERS.has(owner)) {
    return {owner, layer: 'consumer_presentation', rationale: `consumer owner ${owner}`};
  }
  if (RAW_MARKER.test(basename)) {
    return {owner, layer: 'raw_observation', rationale: 'observation/evidence surface'};
  }
  if (OWNER_DECISION_MARKER.test(basename)) {
    return {owner, layer: 'owner_decision', rationale: 'owner policy or actuation surface'};
  }
  if (SNAPSHOT_MARKER.test(basename)) {
    return {owner, layer: 'canonical_snapshot_reducer', rationale: 'snapshot/reducer contract surface'};
  }
  return {owner, layer: 'owner_decision', rationale: 'owner policy or actuation surface'};
}

function exportedNames(source) {
  const names = new Set();
  const localNames = new Set();
  const declaredNames = new Set([...source.matchAll(
    /\b(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gu,
  )].map((match) => match[1]));
  const declaration = /\bexport\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gu;
  for (const match of source.matchAll(declaration)) {
    names.add(match[1]);
    localNames.add(match[1]);
  }
  const blocks = /\bexport\s*\{([^}]+)\}(\s+from\s+['"][^'"]+['"])?/gu;
  for (const match of source.matchAll(blocks)) {
    for (const item of match[1].split(',')) {
      const aliases = item.trim().split(/\s+as\s+/u);
      const sourceName = aliases[0]?.trim();
      const normalized = aliases.at(-1)?.trim();
      if (normalized) {
        names.add(normalized);
        if (!match[2] && declaredNames.has(sourceName)) localNames.add(normalized);
      }
    }
  }
  if (/\bexport\s+default\b/u.test(source)) {
    names.add('default');
    localNames.add('default');
  }
  for (const match of source.matchAll(/\bexport\s*\*\s*from\s*['"]([^'"]+)['"]/gu)) {
    names.add(`*:${match[1]}`);
  }
  return {public: [...names].sort(), local: [...localNames].sort()};
}

function stronglyConnectedComponents(nodes, edges) {
  const adjacency = new Map(nodes.map((node) => [node, []]));
  for (const edge of edges) {
    if (adjacency.has(edge.from) && adjacency.has(edge.to)) {
      adjacency.get(edge.from).push(edge.to);
    }
  }
  let cursor = 0;
  const stack = [];
  const onStack = new Set();
  const index = new Map();
  const low = new Map();
  const components = [];
  const visit = (node) => {
    index.set(node, cursor);
    low.set(node, cursor);
    cursor += 1;
    stack.push(node);
    onStack.add(node);
    for (const next of adjacency.get(node)) {
      if (!index.has(next)) {
        visit(next);
        low.set(node, Math.min(low.get(node), low.get(next)));
      } else if (onStack.has(next)) {
        low.set(node, Math.min(low.get(node), index.get(next)));
      }
    }
    if (low.get(node) === index.get(node)) {
      const component = [];
      let member;
      do {
        member = stack.pop();
        onStack.delete(member);
        component.push(member);
      } while (member !== node);
      components.push(component.sort());
    }
  };
  for (const node of nodes) if (!index.has(node)) visit(node);
  return components.sort((left, right) => right.length - left.length ||
    left[0].localeCompare(right[0]));
}

function slug(value) {
  return value.replace(/([a-z])([A-Z])/gu, '$1-$2').toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '');
}

function functionImplementation(source, name) {
  const start = source.search(new RegExp(`\\bfunction\\s+${name}\\s*\\(`, 'u'));
  if (start < 0) return null;
  const bodyMarker = source.slice(start).match(/\)\s*\{/u);
  if (!bodyMarker) return null;
  const bodyStart = start + bodyMarker.index + bodyMarker[0].length - 1;
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '\'' || character === '"' || character === '`') {
      quote = character;
      continue;
    }
    if (character === '{') depth += 1;
    if (character === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1).replace(/\s+/gu, ' ');
    }
  }
  return null;
}

function implementationSimilarity(left, right) {
  const grams = (value) => {
    const normalized = value.replace(/\s+/gu, ' ');
    const result = new Set();
    for (let index = 0; index <= normalized.length - 5; index += 1) {
      result.add(normalized.slice(index, index + 5));
    }
    return result;
  };
  const leftGrams = grams(left);
  const rightGrams = grams(right);
  const shared = [...leftGrams].filter((value) => rightGrams.has(value)).length;
  return Number((shared / Math.max(1, leftGrams.size + rightGrams.size - shared))
    .toFixed(3));
}

function duplicateAuthorities(modules, root) {
  const byName = new Map();
  for (const module of modules) {
    for (const name of module.localExports.filter((item) => AUTHORITY_EXPORT.test(item))) {
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push(module.path);
    }
  }
  return [...byName.entries()]
    .filter(([, files]) => files.length > 1)
    .map(([exportName, files]) => {
      const implementationsWithSource = files.sort().map((file) => {
        const source = fs.readFileSync(path.join(root, file), 'utf8');
        const implementation = functionImplementation(source, exportName);
        return {
          module: file,
          source: implementation,
          implementationSha256: implementation ?
            crypto.createHash('sha256').update(implementation).digest('hex') : null,
        };
      });
      const implementations = implementationsWithSource.map(({source: _source, ...item}) =>
        item);
      const hashes = new Set(implementations.map((item) => item.implementationSha256));
      const implementationPairs = [];
      for (let left = 0; left < implementationsWithSource.length; left += 1) {
        for (let right = left + 1; right < implementationsWithSource.length; right += 1) {
          const leftItem = implementationsWithSource[left];
          const rightItem = implementationsWithSource[right];
          implementationPairs.push({
            modules: [leftItem.module, rightItem.module],
            similarity: leftItem.source && rightItem.source ?
              implementationSimilarity(leftItem.source, rightItem.source) : 0,
          });
        }
      }
      return {
        exportName,
        modules: files,
        implementations,
        implementationPairs,
        confirmedDuplicateImplementation: !hashes.has(null) && hashes.size === 1,
      };
    })
    .sort((left, right) => left.exportName.localeCompare(right.exportName));
}

function candidatesFor(duplicates, classifications) {
  const grouped = new Map();
  for (const duplicate of duplicates) {
    for (const pair of duplicate.implementationPairs.filter((item) =>
      item.similarity >= 0.7)) {
      const key = pair.modules.join('\0');
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push({name: duplicate.exportName, similarity: pair.similarity});
    }
  }
  const candidates = [...grouped.entries()].map(([key, authoritySignals]) => {
    const modules = key.split('\0');
    const owners = [...new Set(modules.map((file) =>
      classifications.get(file).owner))].sort();
    const authorities = authoritySignals.map((item) => item.name).sort();
    const questId = `priority-recovery-${owners.map(slug).join('-')}-${slug(authorities[0])}-authority`;
    return {
      questId,
      ownerBoundary: owners.join('->'),
      ownerAreas: owners,
      authorities: authorities.sort(),
      implementationSimilarities: authoritySignals.sort((left, right) =>
        left.name.localeCompare(right.name)),
      modules,
      pathscope: modules,
      exactScenarioCommand: `node scripts/run-${questId}-scenarios.js`,
      reportPredicate: `${questId}: three consecutive PASS reports with zero priority items`,
      engagementWitness: `consumer trace proves ${owners.join(' -> ')} imports one canonical authority for ${authorities.join(', ')}`,
      verifierTemplates: ['recovery-replay.md', 'harness-fidelity.md'],
    };
  });
  return candidates.sort((left, right) => left.questId.localeCompare(right.questId));
}

export async function buildInventory(root = ROOT) {
  const targets = sourceFiles(root);
  const classifications = new Map(targets.map((file) => [file, classifyModule(file)]));
  const cruiseResult = await cruise(targets.map((file) => path.join(root, file)), {
    baseDir: root,
    exclude: 'node_modules',
    doNotFollow: {path: 'node_modules'},
  });
  const cruised = new Map(cruiseResult.output.modules.map((module) =>
    [module.source.replaceAll(path.sep, '/'), module]));
  const modules = targets.map((file) => {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const classification = classifications.get(file);
    const exports = exportedNames(source);
    return {
      path: file,
      ...classification,
      exports: exports.public,
      localExports: exports.local,
    };
  });
  const edges = [];
  const unparsedImportEdges = [];
  if ((cruiseResult.output.summary?.error || 0) > 0) {
    unparsedImportEdges.push({
      from: 'dependency-cruiser',
      problem: `${cruiseResult.output.summary.error} parser error(s)`,
    });
  }
  for (const module of modules) {
    const parsed = cruised.get(module.path);
    if (!parsed) {
      unparsedImportEdges.push({from: module.path, problem: 'module absent from parsed graph'});
      continue;
    }
    for (const dependency of parsed.dependencies) {
      const resolved = dependency.resolved?.replaceAll(path.sep, '/') || null;
      if (dependency.couldNotResolve) {
        unparsedImportEdges.push({from: module.path, specifier: dependency.module,
          problem: 'unresolved import'});
      }
      const target = classifications.get(resolved);
      edges.push({
        from: module.path,
        specifier: dependency.module,
        to: resolved,
        targetModule: Boolean(target),
        sourceLayer: module.layer,
        targetLayer: target?.layer || null,
        crossLayer: Boolean(target && target.layer !== module.layer),
        conformsToLayerDirection: target ?
          LAYER_ORDER[target.layer] <= LAYER_ORDER[module.layer] : null,
      });
    }
  }
  edges.sort((left, right) => left.from.localeCompare(right.from) ||
    left.specifier.localeCompare(right.specifier));
  const targetEdges = edges.filter((edge) => edge.targetModule);
  const components = stronglyConnectedComponents(targets, targetEdges);
  const duplicates = duplicateAuthorities(modules, root);
  const migrationCandidates = candidatesFor(duplicates, classifications);
  const sourceHash = crypto.createHash('sha256');
  for (const file of targets) {
    sourceHash.update(file).update('\0').update(fs.readFileSync(path.join(root, file)));
  }
  return {
    schemaVersion: 'priority-recovery-owner-inventory-v1',
    generatedFrom: {root: 'src', sourceSha256: sourceHash.digest('hex')},
    layerDirection: Object.keys(LAYER_ORDER),
    candidateSelection: {
      signal: 'same locally-declared exported authority name',
      similarity: 'Jaccard similarity over normalized five-character grams',
      threshold: 0.7,
      disposition: 'proposal requiring independent architecture and proof approval',
    },
    metrics: {
      moduleCount: modules.length,
      publicExportCount: modules.reduce((sum, module) => sum + module.exports.length, 0),
      importEdgeCount: edges.length,
      crossLayerEdgeCount: targetEdges.filter((edge) => edge.crossLayer).length,
      layerDirectionViolationCount: targetEdges.filter((edge) =>
        !edge.conformsToLayerDirection).length,
      largestStronglyConnectedComponent: components[0]?.length || 0,
      duplicateAuthoritySignalCount: duplicates.length,
      confirmedDuplicateAuthorityCount: duplicates.filter((item) =>
        item.confirmedDuplicateImplementation).length,
      migrationCandidateCount: migrationCandidates.length,
    },
    closure: {
      uniquelyClassifiedModules: modules.length,
      uniqueClassificationRate: modules.length === 0 ? 0 : 1,
      unparsedImportEdgeCount: unparsedImportEdges.length,
      proposedDirectionAcyclic: components[0]?.length === 1,
      candidatesUseOneOwnerBoundary: migrationCandidates.every((candidate) =>
        candidate.ownerAreas.length <= 2),
    },
    modules,
    edges,
    stronglyConnectedComponents: components,
    unparsedImportEdges,
    duplicateAuthorities: duplicates,
    migrationCandidates,
  };
}

async function writeInventory(root = ROOT, output = OUTPUT) {
  const inventory = await buildInventory(root);
  const destination = path.resolve(root, output);
  fs.mkdirSync(path.dirname(destination), {recursive: true});
  fs.writeFileSync(destination, `${JSON.stringify(inventory, null, 2)}\n`);
  return {destination, inventory};
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const outputIndex = process.argv.indexOf('--output');
  const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : OUTPUT;
  const result = await writeInventory(process.cwd(), output);
  process.stdout.write(`${result.destination}\n`);
  process.stdout.write(`${JSON.stringify(result.inventory.metrics)}\n`);
}
