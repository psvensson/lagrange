#!/usr/bin/env node

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath, pathToFileURL} from 'node:url';

import {cruise} from 'dependency-cruiser';

import {
  buildFileSizeEntries,
  FILE_SIZE_BASELINES,
  FILE_SIZE_SCOPE,
  FILE_SIZE_THRESHOLDS,
} from './check-file-size-thresholds.js';
import {
  OWNER_DEBT,
  OWNER_DEBT_CHILD_LIMITS as CHILD_LIMITS,
  OWNER_DEBT_REFRESH_COMMANDS as REFRESH_COMMANDS,
  OWNER_DEBT_REPORTS as REPORTS,
  OWNER_DEBT_SIGNAL_KIND as SIGNAL_KIND,
  OWNER_DEBT_SIGNAL_WEIGHTS as SIGNAL_WEIGHTS,
  OWNER_DEBT_SOURCE_DIRECTORIES as SOURCE_DIRECTORIES,
} from './global-owner-debt-inventory/constants.js';
import {
  classifyDebtPath,
  duplicationReportIdentity,
  fileIdentity,
  globPatternToRegex,
  javascriptSourceDigest,
  listJavaScriptFiles,
  logicalJsonIdentity,
  normalizePath,
  ownerAreaForPath,
  readJson,
  reconcileAssignments,
  sha256,
  signalId,
} from './global-owner-debt-inventory/helpers.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = OWNER_DEBT.output;

function emptyFileDebt(filePath, importDegrees) {
  return {
    path: filePath,
    classification: classifyDebtPath(filePath),
    complexity: 0,
    cognitive: 0,
    oversizedLines: 0,
    duplicatedLines: 0,
    cloneTouches: 0,
    cycleGroups: 0,
    lintExclusions: 0,
    structuralScore: 0,
    importIn: importDegrees.get(filePath)?.in || 0,
    importOut: importDegrees.get(filePath)?.out || 0,
    signalCount: 0,
    score: 0,
  };
}

function scoreFileDebt(debt) {
  return debt.complexity * SIGNAL_WEIGHTS.complexity +
    debt.cognitive * SIGNAL_WEIGHTS.cognitive +
    (debt.oversizedLines > 0 ? SIGNAL_WEIGHTS.fileSize : 0) +
    Math.min(debt.duplicatedLines, SIGNAL_WEIGHTS.duplicatedLineCap) /
      SIGNAL_WEIGHTS.duplicatedLineDivisor +
    debt.cycleGroups * SIGNAL_WEIGHTS.cycle +
    debt.lintExclusions * SIGNAL_WEIGHTS.lintExclusion;
}

function scoreStructuralDebt(debt) {
  return (debt.oversizedLines > 0 ? SIGNAL_WEIGHTS.fileSize : 0) +
    Math.min(debt.duplicatedLines, SIGNAL_WEIGHTS.duplicatedLineCap) /
      SIGNAL_WEIGHTS.duplicatedLineDivisor +
    debt.lintExclusions * SIGNAL_WEIGHTS.lintExclusion;
}

function ensureFileDebt(files, filePath, importDegrees) {
  if (!files.has(filePath)) {
    files.set(filePath, emptyFileDebt(filePath, importDegrees));
  }
  return files.get(filePath);
}

function collectReportSignals(root, inputs) {
  const signals = [];
  const add = (kind, filePath, fields, apply) => {
    const normalizedPath = normalizePath(root, filePath);
    const signal = {id: signalId(kind, [normalizedPath, ...fields]), kind,
      path: normalizedPath};
    signals.push(signal);
    apply(signal);
  };
  const files = new Map();
  for (const violation of inputs.complexity.violations) {
    add(SIGNAL_KIND.complexity, violation.filePath,
      [violation.line, violation.column, violation.message], () => {
        const debt = ensureFileDebt(files, normalizePath(root, violation.filePath),
          inputs.importGraph.degrees);
        debt.complexity += 1;
        debt.signalCount += 1;
      });
  }
  for (const violation of inputs.cognitive.violations) {
    add(SIGNAL_KIND.cognitive, violation.filePath,
      [violation.line, violation.column, violation.message], () => {
        const debt = ensureFileDebt(files, normalizePath(root, violation.filePath),
          inputs.importGraph.degrees);
        debt.cognitive += 1;
        debt.signalCount += 1;
      });
  }
  for (const entry of inputs.fileSizes) {
    add(SIGNAL_KIND.fileSize, entry.path,
      [entry.scope, entry.lines, entry.threshold], () => {
        const debt = ensureFileDebt(files, normalizePath(root, entry.path),
          inputs.importGraph.degrees);
        debt.oversizedLines = entry.lines;
        debt.signalCount += 1;
      });
  }
  for (const target of inputs.duplication) {
    for (const [filePath, stats] of Object.entries(target.sources)) {
      if (stats.duplicatedLines === 0) continue;
      add(SIGNAL_KIND.duplication, filePath,
        [target.name, stats.clones, stats.duplicatedLines], () => {
          const debt = ensureFileDebt(files, normalizePath(root, filePath),
            inputs.importGraph.degrees);
          debt.duplicatedLines += stats.duplicatedLines;
          debt.cloneTouches += stats.clones;
          debt.signalCount += 1;
        });
    }
  }
  for (const cycleGroup of inputs.cycles.cycleGroups) {
    const ownerPath = [...cycleGroup].sort()[0];
    add(SIGNAL_KIND.cycle, ownerPath, [...cycleGroup].sort(), () => {
      const debt = ensureFileDebt(files, normalizePath(root, ownerPath),
        inputs.importGraph.degrees);
      debt.cycleGroups += 1;
      debt.signalCount += 1;
    });
  }
  for (const exclusion of inputs.lintExclusions.matches) {
    add(SIGNAL_KIND.lintExclusion, exclusion.path, [exclusion.pattern], () => {
      const debt = ensureFileDebt(files, exclusion.path, inputs.importGraph.degrees);
      debt.lintExclusions += 1;
      debt.signalCount += 1;
    });
  }
  for (const debt of files.values()) {
    debt.score = scoreFileDebt(debt);
    debt.structuralScore = scoreStructuralDebt(debt);
  }
  return {signals, files};
}

function aggregateBoundaries(files) {
  const grouped = new Map();
  for (const debt of files.values()) {
    const key = debt.classification.key;
    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        owner: debt.classification.owner,
        boundary: debt.classification.boundary,
        classification: debt.classification.classification,
        ownerAreas: new Set(),
        files: [],
        signalCount: 0,
        complexity: 0,
        cognitive: 0,
        oversizedFiles: 0,
        duplicatedLines: 0,
        cloneTouches: 0,
        cycleGroups: 0,
        lintExclusions: 0,
        importIn: 0,
        importOut: 0,
        score: 0,
        structuralScore: 0,
      });
    }
    const boundary = grouped.get(key);
    boundary.ownerAreas.add(debt.classification.ownerArea);
    boundary.files.push(debt);
    boundary.signalCount += debt.signalCount;
    boundary.complexity += debt.complexity;
    boundary.cognitive += debt.cognitive;
    boundary.oversizedFiles += debt.oversizedLines > 0 ? 1 : 0;
    boundary.duplicatedLines += debt.duplicatedLines;
    boundary.cloneTouches += debt.cloneTouches;
    boundary.cycleGroups += debt.cycleGroups;
    boundary.lintExclusions += debt.lintExclusions;
    boundary.importIn += debt.importIn;
    boundary.importOut += debt.importOut;
    boundary.score += debt.score;
    boundary.structuralScore += debt.structuralScore;
  }
  return [...grouped.values()].map((boundary) => {
    const rankedFiles = [...boundary.files].sort((left, right) =>
      right.score - left.score || left.path.localeCompare(right.path));
    const structuralFiles = boundary.files.filter((file) => file.structuralScore > 0)
      .sort((left, right) => right.structuralScore - left.structuralScore ||
        left.path.localeCompare(right.path));
    const result = {
      key: boundary.key,
      owner: boundary.owner,
      boundary: boundary.boundary,
      classification: boundary.classification,
      ownerAreas: [...boundary.ownerAreas].sort(),
      fileCount: boundary.files.length,
      signalCount: boundary.signalCount,
      complexity: boundary.complexity,
      cognitive: boundary.cognitive,
      oversizedFiles: boundary.oversizedFiles,
      duplicatedLines: boundary.duplicatedLines,
      cloneTouches: boundary.cloneTouches,
      cycleGroups: boundary.cycleGroups,
      lintExclusions: boundary.lintExclusions,
      importIn: boundary.importIn,
      importOut: boundary.importOut,
      score: Number(boundary.score.toFixed(1)),
      topPaths: rankedFiles.slice(0, CHILD_LIMITS.samplePaths).map((file) => file.path),
    };
    Object.defineProperties(result, {
      structuralScoreInternal: {
        value: Number(boundary.structuralScore.toFixed(1)),
        enumerable: false,
      },
      structuralTargetsInternal: {
        value: structuralFiles.slice(0, CHILD_LIMITS.samplePaths).map((file) => ({
          path: file.path,
          duplicatedLines: file.duplicatedLines,
          oversizedLines: file.oversizedLines,
          lintExclusions: file.lintExclusions,
          structuralScore: Number(file.structuralScore.toFixed(1)),
        })),
        enumerable: false,
      },
    });
    return result;
  }).sort((left, right) => right.score - left.score ||
    left.key.localeCompare(right.key));
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/gu, OWNER_DEBT.hyphen)
    .replace(/^-|-$/gu, '');
}

function adjacentTestsFor(boundary, importGraph) {
  const sources = new Set(boundary.topPaths.filter((file) => file.startsWith('src/')));
  return [...sources].flatMap((source) => importGraph.importers.get(source) || [])
    .filter((file) => file.startsWith(OWNER_DEBT.testPrefix))
    .sort()
    .slice(0, CHILD_LIMITS.adjacentTests);
}

function candidateFor(boundary, lane, importGraph) {
  const prefix = lane === OWNER_DEBT.laneM4c ?
    'test-structure-burndown' : 'owner-complexity';
  const ownerSlug = slug(boundary.owner || boundary.boundary);
  const boundarySlug = slug(boundary.boundary);
  const questId = lane === OWNER_DEBT.laneM4c ? `${prefix}-${boundarySlug}` :
    `${prefix}-${ownerSlug}-${boundarySlug}`;
  const engagementPaths = lane === OWNER_DEBT.laneM4c ?
    boundary.structuralTargetsInternal.map((target) => target.path) :
    boundary.topPaths;
  const engagementTargets = lane === OWNER_DEBT.laneM4c ?
    boundary.structuralTargetsInternal : [];
  const pathscope = [...new Set([
    ...engagementPaths,
    ...adjacentTestsFor(boundary, importGraph),
    `scripts/run-${questId}-scenarios.js`,
    `solve/quests/${questId}.json`,
  ])].sort();
  const ownerAreas = [...new Set(pathscope.map(ownerAreaForPath))].sort();
  if (pathscope.length > CHILD_LIMITS.pathCount ||
      ownerAreas.length > CHILD_LIMITS.ownerAreas) {
    throw new Error(`${questId} exceeds the bounded child pathscope`);
  }
  return {
    lane,
    questId,
    owner: boundary.owner,
    boundary: boundary.boundary,
    exactScenarioCommand: `node scripts/run-${questId}-scenarios.js`,
    pathscope,
    ownerAreas,
    engagementPaths,
    engagementTargets,
    baseline: {
      score: boundary.score,
      complexity: boundary.complexity,
      cognitive: boundary.cognitive,
      oversizedFiles: boundary.oversizedFiles,
      duplicatedLines: boundary.duplicatedLines,
      lintExclusions: boundary.lintExclusions,
    },
    proof: OWNER_DEBT.childProof,
  };
}

function childQuestBatch(boundaries, importGraph) {
  const semantic = boundaries.filter((item) =>
    item.classification === OWNER_DEBT.classDeclaredOwner && item.signalCount > 0);
  const m2 = semantic.filter((item) => item.ownerAreas.some((area) =>
    area === 'src/control-plane' || area === 'src/rebalancer'))
    .slice(0, CHILD_LIMITS.m2)
    .map((item) => candidateFor(item, 'm2', importGraph));
  const m3 = semantic.filter((item) => item.ownerAreas.some((area) =>
    area === 'src/query' || area === 'src/bootstrap'))
    .slice(0, CHILD_LIMITS.m3)
    .map((item) => candidateFor(item, 'm3', importGraph));
  const m4c = boundaries.filter((item) =>
    item.classification === OWNER_DEBT.classTestOwnerArea &&
    (item.oversizedFiles > 0 || item.duplicatedLines > 0 || item.lintExclusions > 0))
    .sort((left, right) =>
      right.structuralScoreInternal - left.structuralScoreInternal ||
      left.key.localeCompare(right.key))
    .slice(0, CHILD_LIMITS.m4c)
    .map((item) => candidateFor(item, OWNER_DEBT.laneM4c, importGraph));
  return {
    sealed: true,
    expansionRule: OWNER_DEBT.expansionRule,
    limits: CHILD_LIMITS,
    quests: [...m2, ...m3, ...m4c],
  };
}

function duplicationReconciliation(target) {
  const sources = Object.values(target.sources);
  return {
    name: target.name,
    identity: target.identity,
    cloneGroups: target.total.clones,
    duplicatedLines: target.total.duplicatedLines,
    sourceCloneTouches: sources.reduce((sum, entry) => sum + entry.clones, 0),
    sourceDuplicatedLineTouches: sources.reduce((sum, entry) =>
      sum + entry.duplicatedLines, 0),
    nonzeroSourceCount: sources.filter((entry) => entry.duplicatedLines > 0).length,
    touchMultiplicity: 2,
  };
}

function buildInventoryFromInputs(root, inputs) {
  const {signals, files} = collectReportSignals(root, inputs);
  const assignments = signals.map((signal) => ({
    id: signal.id,
    boundaryKey: classifyDebtPath(signal.path).key,
  }));
  const assignment = reconcileAssignments(signals, assignments);
  const boundaries = aggregateBoundaries(files);
  const signalCounts = Object.fromEntries([...new Set(signals.map((item) => item.kind))]
    .sort().map((kind) => [kind, signals.filter((item) => item.kind === kind).length]));
  const duplication = inputs.duplication.map(duplicationReconciliation);
  const inputIdentities = [
    inputs.identities.complexity,
    inputs.identities.cognitive,
    inputs.identities.cycles,
    inputs.identities.importGraph,
    inputs.identities.duplicationSource,
    inputs.identities.duplicationTest,
    inputs.identities.fileSizeAuthority,
    inputs.identities.lintConfig,
    inputs.identities.dependencyConfig,
    inputs.identities.ownerClassifier,
  ];
  return {
    schemaVersion: OWNER_DEBT.schemaVersion,
    generatedFrom: {
      root: OWNER_DEBT.rootRelative,
      inputs: inputIdentities,
      inputDigest: sha256(inputIdentities.map((item) => item.sha256)
        .join(OWNER_DEBT.newline)),
    },
    reconciliation: {
      complexity: {
        identity: inputs.identities.complexity,
        declaredCount: inputs.complexity.count,
        observedCount: inputs.complexity.violations.length,
        assignedCount: signalCounts.complexity || 0,
      },
      cognitive: {
        identity: inputs.identities.cognitive,
        declaredCount: inputs.cognitive.count,
        observedCount: inputs.cognitive.violations.length,
        assignedCount: signalCounts.cognitive || 0,
      },
      fileSize: {
        authority: inputs.identities.fileSizeAuthority,
        thresholds: FILE_SIZE_THRESHOLDS,
        baselines: FILE_SIZE_BASELINES,
        observedCount: inputs.fileSizes.length,
        assignedCount: signalCounts.fileSize || 0,
      },
      duplication,
      cycles: {
        identity: inputs.identities.cycles,
        observedCount: inputs.cycles.cycleGroups.length,
        assignedCount: signalCounts.cycle || 0,
      },
      lintExclusions: {
        identity: inputs.identities.lintConfig,
        patterns: inputs.lintExclusions.patterns,
        observedCount: inputs.lintExclusions.matches.length,
        assignedCount: signalCounts.lintExclusion || 0,
      },
      importGraph: {
        identity: inputs.identities.importGraph,
        authority: inputs.identities.dependencyConfig,
        sourceDigest: inputs.importGraph.sourceDigest,
        moduleCount: inputs.importGraph.moduleCount,
        edgeCount: inputs.importGraph.edgeCount,
        unresolvedCount: inputs.importGraph.unresolvedCount,
      },
    },
    assignment,
    signalCounts,
    summary: {
      filesWithDebt: files.size,
      rankedBoundaryCount: boundaries.length,
      semanticBoundaryCount: boundaries.filter((item) => item.owner !== null).length,
      fallbackBoundaryCount: boundaries.filter((item) => item.owner === null).length,
      childQuestCount: 0,
    },
    rankedBoundaries: boundaries,
    childQuestBatch: childQuestBatch(boundaries, inputs.importGraph),
  };
}

function validateInventory(inventory) {
  const checks = [
    inventory.reconciliation.complexity.declaredCount ===
      inventory.reconciliation.complexity.observedCount,
    inventory.reconciliation.complexity.observedCount ===
      inventory.reconciliation.complexity.assignedCount,
    inventory.reconciliation.cognitive.declaredCount ===
      inventory.reconciliation.cognitive.observedCount,
    inventory.reconciliation.cognitive.observedCount ===
      inventory.reconciliation.cognitive.assignedCount,
    inventory.reconciliation.fileSize.observedCount ===
      inventory.reconciliation.fileSize.assignedCount,
    inventory.reconciliation.cycles.observedCount ===
      inventory.reconciliation.cycles.assignedCount,
    inventory.reconciliation.lintExclusions.observedCount ===
      inventory.reconciliation.lintExclusions.assignedCount,
    inventory.assignment.sourceSignalCount === inventory.assignment.assignedSignalCount,
    inventory.assignment.assignedSignalCount === inventory.assignment.uniqueAssignmentCount,
    inventory.childQuestBatch.quests.length > 0,
  ];
  if (checks.some((passed) => !passed)) {
    throw new Error(OWNER_DEBT.reconciliationError);
  }
  for (const target of inventory.reconciliation.duplication) {
    if (target.sourceCloneTouches !== target.cloneGroups * target.touchMultiplicity ||
        target.sourceDuplicatedLineTouches !==
          target.duplicatedLines * target.touchMultiplicity) {
      throw new Error(`duplication source touches do not reconcile for ${target.name}`);
    }
  }
  inventory.summary.childQuestCount = inventory.childQuestBatch.quests.length;
  return inventory;
}

// The metric checkers exit 1 when their RATCHET is exceeded while still
// writing a complete, fresh report — and elevated debt is exactly what this
// inventory exists to measure, so a red ratchet must not make the debt
// unmeasurable (measured 2026-07-29: three landed clone groups made every
// downstream refresh crash, cascading into the CI owner-debt gate). Only a
// checker CRASH (any other nonzero exit) aborts the refresh; ratchet
// breaches are surfaced and recorded, never fatal here — the pre-push hook
// remains the ratchet's enforcement point.
function refreshReports(root) {
  for (const args of REFRESH_COMMANDS) {
    const result = spawnSync(process.execPath, args, {cwd: root, stdio: 'inherit'});
    if (result.status === 1) {
      process.stderr.write(
        `owner-debt refresh: ratchet exceeded in node ${args.join(OWNER_DEBT.space)}; ` +
        'report refreshed, elevated debt will be recorded\n');
      continue;
    }
    if (result.status !== 0) {
      throw new Error(`report refresh failed: node ${args.join(OWNER_DEBT.space)}`);
    }
  }
}

async function loadLintExclusions(root, files) {
  const configUrl = `${pathToFileURL(path.join(root, OWNER_DEBT.lintAuthority)).href}` +
    `?ownerDebt=${Date.now()}`;
  const config = (await import(configUrl)).default;
  const patterns = [...new Set(config.flatMap((entry) => entry.ignores || []))].sort();
  const matchers = patterns.map((pattern) => ({pattern,
    regex: globPatternToRegex(pattern)}));
  const matches = files.flatMap((filePath) => matchers
    .filter((matcher) => matcher.regex.test(filePath))
    .map((matcher) => ({path: filePath, pattern: matcher.pattern})));
  return {patterns, matches};
}

async function buildImportGraph(root, files) {
  const result = await cruise(SOURCE_DIRECTORIES.map((directory) =>
    path.join(root, directory)), {
    baseDir: root,
    exclude: 'node_modules',
    doNotFollow: {path: 'node_modules'},
  });
  const degrees = new Map(files.map((file) => [file, {in: 0, out: 0}]));
  const importers = new Map();
  let edgeCount = 0;
  let unresolvedCount = result.output.summary?.error || 0;
  for (const module of result.output.modules) {
    const source = normalizePath(root, module.source);
    if (!degrees.has(source)) degrees.set(source, {in: 0, out: 0});
    for (const dependency of module.dependencies) {
      edgeCount += 1;
      degrees.get(source).out += 1;
      if (dependency.couldNotResolve || !dependency.resolved) {
        unresolvedCount += 1;
        continue;
      }
      const target = normalizePath(root, dependency.resolved);
      if (!degrees.has(target)) degrees.set(target, {in: 0, out: 0});
      degrees.get(target).in += 1;
      if (!importers.has(target)) importers.set(target, []);
      importers.get(target).push(source);
    }
  }
  return {
    sourceDigest: javascriptSourceDigest(root, files),
    moduleCount: result.output.modules.length,
    edgeCount,
    unresolvedCount,
    degrees,
    importers,
  };
}

function serializeImportGraph(importGraph) {
  return {
    schemaVersion: OWNER_DEBT.importGraphSchemaVersion,
    sourceDigest: importGraph.sourceDigest,
    moduleCount: importGraph.moduleCount,
    edgeCount: importGraph.edgeCount,
    unresolvedCount: importGraph.unresolvedCount,
    degrees: Object.fromEntries([...importGraph.degrees.entries()].sort()),
    importers: Object.fromEntries([...importGraph.importers.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([target, importers]) => [target, [...new Set(importers)].sort()])),
  };
}

async function refreshImportGraphReport(root, files) {
  const report = serializeImportGraph(await buildImportGraph(root, files));
  const destination = path.join(root, REPORTS.importGraph);
  fs.mkdirSync(path.dirname(destination), {recursive: true});
  fs.writeFileSync(destination, `${JSON.stringify(report)}\n`);
  return report;
}

function readImportGraphReport(root, files) {
  const report = readJson(root, REPORTS.importGraph);
  const sourceDigest = javascriptSourceDigest(root, files);
  if (report.sourceDigest !== sourceDigest) {
    throw new Error(OWNER_DEBT.staleImportGraphError);
  }
  return {
    sourceDigest,
    moduleCount: report.moduleCount,
    edgeCount: report.edgeCount,
    unresolvedCount: report.unresolvedCount,
    degrees: new Map(Object.entries(report.degrees)),
    importers: new Map(Object.entries(report.importers)),
  };
}

async function collectLiveInputs(root) {
  const files = listJavaScriptFiles(root);
  const [sourceSizes, testSizes, lintExclusions] = await Promise.all([
    buildFileSizeEntries(FILE_SIZE_SCOPE.SOURCE,
      path.join(root, OWNER_DEBT.sourceDirectory)),
    buildFileSizeEntries(FILE_SIZE_SCOPE.TEST,
      path.join(root, OWNER_DEBT.testDirectory)),
    loadLintExclusions(root, files),
  ]);
  const importGraph = readImportGraphReport(root, files);
  const duplicationSource = readJson(root, REPORTS.duplicationSource);
  const duplicationTest = readJson(root, REPORTS.duplicationTest);
  const duplicationSourceIdentity = duplicationReportIdentity(
    REPORTS.duplicationSource, duplicationSource);
  const duplicationTestIdentity = duplicationReportIdentity(
    REPORTS.duplicationTest, duplicationTest);
  return {
    complexity: readJson(root, REPORTS.complexity),
    cognitive: readJson(root, REPORTS.cognitive),
    cycles: readJson(root, REPORTS.cycles),
    fileSizes: [...sourceSizes, ...testSizes],
    duplication: [
      {name: OWNER_DEBT.sourceDuplicationTarget, identity: duplicationSourceIdentity,
        total: duplicationSource.statistics.total,
        sources: duplicationSource.statistics.formats.javascript.sources},
      {name: OWNER_DEBT.testDuplicationTarget, identity: duplicationTestIdentity,
        total: duplicationTest.statistics.total,
        sources: duplicationTest.statistics.formats.javascript.sources},
    ],
    lintExclusions,
    importGraph,
    identities: {
      complexity: fileIdentity(root, REPORTS.complexity),
      cognitive: fileIdentity(root, REPORTS.cognitive),
      cycles: fileIdentity(root, REPORTS.cycles),
      importGraph: fileIdentity(root, REPORTS.importGraph),
      duplicationSource: duplicationSourceIdentity,
      duplicationTest: duplicationTestIdentity,
      fileSizeAuthority: fileIdentity(root, OWNER_DEBT.fileSizeAuthority),
      lintConfig: fileIdentity(root, OWNER_DEBT.lintAuthority),
      dependencyConfig: fileIdentity(root, OWNER_DEBT.dependencyAuthority),
      ownerClassifier: fileIdentity(root, OWNER_DEBT.ownerClassifierAuthority),
    },
  };
}

async function buildInventory(root = ROOT, options = {}) {
  if (options.refresh === true) {
    refreshReports(root);
    await refreshImportGraphReport(root, listJavaScriptFiles(root));
  } else if (options.refreshImportGraph === true) {
    await refreshImportGraphReport(root, listJavaScriptFiles(root));
  }
  return validateInventory(buildInventoryFromInputs(root,
    await collectLiveInputs(root)));
}

function writeInventory(root, inventory, output = OUTPUT) {
  const destination = path.join(root, output);
  fs.mkdirSync(path.dirname(destination), {recursive: true});
  fs.writeFileSync(destination, `${JSON.stringify(inventory, null, 2)}\n`);
  return destination;
}

async function runCli(args = process.argv.slice(2)) {
  const outputIndex = args.indexOf('--output');
  const output = outputIndex >= 0 ? args[outputIndex + 1] : OUTPUT;
  const inventory = await buildInventory(process.cwd(), {
    refresh: args.includes('--refresh'),
    refreshImportGraph: args.includes('--refresh-import-graph'),
  });
  const destination = writeInventory(process.cwd(), inventory, output);
  process.stdout.write(`${destination}\n`);
  process.stdout.write(`${JSON.stringify(inventory.summary)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}

export {
  buildInventory,
  buildInventoryFromInputs,
  classifyDebtPath,
  collectLiveInputs,
  duplicationReportIdentity,
  globPatternToRegex,
  logicalJsonIdentity,
  reconcileAssignments,
  validateInventory,
  writeInventory,
};
