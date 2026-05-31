#!/usr/bin/env node

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

import {
  normalizeMetadata,
} from './work-package-schema.js';
import {
  findActivePackageFile,
  findActiveSprintFile,
} from './work-tracker.js';

const EMPTY_TEXT = '';
const NEWLINE = '\n';
const NUM_ZERO = 0;
const NUM_ONE = 1;
const PACKAGE_METADATA_OPEN = '<!-- work-package';
const AGENT_CARD_OPEN = '<!-- agent-route-card';
const METADATA_CLOSE = '-->';
const DEFAULT_UNKNOWN = 'unknown';
const DIAGNOSTIC_MODE_READ_ONLY_SCOUTS = 'read-only-scouts';
const DIAGNOSTIC_MODE_VERIFY_ONLY = 'verify-only';
const DIAGNOSTIC_MODE_NONE = 'none';
const CARD_MODE_READ_ONLY = 'read-only';
const CARD_MODE_VERIFY_ONLY = 'verify-only';
const CARD_STATUS_COMPLETE = 'complete';
const ROLE_EVIDENCE_SCOUT = 'evidence-scout';
const ROLE_MODEL_CONTRACT_SCOUT = 'model-contract-scout';
const ROLE_SOURCE_MAP_SCOUT = 'source-map-scout';
const ROLE_VERIFIER = 'verifier';
const SCHEMA_AGENT_ROUTE_CARD = 'agent-route-card-v1';
const PARALLEL_DIAGNOSTICS_FIELD = 'parallelDiagnostics';
const REPORT_DIR_PREFIX = 'work/agent-reports/';
const LOCAL_PATH_PATTERN =
  /^(?:\.kiro|architecture|docs|scripts|src|test|test-output|work|package\.json)(?:\/|$)/u;
const SCOUT_FORBIDDEN_WRITE_FIELDS = Object.freeze([
  'writeScope',
  'commitScope',
  'filesChanged',
]);

const DIAGNOSTIC_MODES = Object.freeze([
  DIAGNOSTIC_MODE_READ_ONLY_SCOUTS,
  DIAGNOSTIC_MODE_VERIFY_ONLY,
  DIAGNOSTIC_MODE_NONE,
]);

const CARD_ROLES = Object.freeze([
  ROLE_EVIDENCE_SCOUT,
  ROLE_MODEL_CONTRACT_SCOUT,
  ROLE_SOURCE_MAP_SCOUT,
  ROLE_VERIFIER,
]);

const SCOUT_ROLES = Object.freeze([
  ROLE_EVIDENCE_SCOUT,
  ROLE_MODEL_CONTRACT_SCOUT,
  ROLE_SOURCE_MAP_SCOUT,
]);

const CARD_MODES = Object.freeze([
  CARD_MODE_READ_ONLY,
  CARD_MODE_VERIFY_ONLY,
]);

const CARD_CONFIDENCE_VALUES = Object.freeze([
  'low',
  'medium',
  'high',
]);

const STALENESS_RISK_VALUES = Object.freeze([
  'none',
  'low',
  'medium',
  'high',
]);

const RECOMMENDED_ROUTES = Object.freeze([
  'runtime-owner-implementation',
  'contract-model-repair',
  'evidence-regeneration',
  'release-gate-expectation-update',
  'architecture-gap',
  'blocked-contradictory-evidence',
  'representative-green',
]);

function normalizeText(value) {
  return String(value || EMPTY_TEXT).trim();
}

function normalizePathText(value) {
  return normalizeText(value).replace(/\\/gu, '/').replace(/^\.\//u, '');
}

function isObjectRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function uniqueValues(values = []) {
  return [...new Set(values.map(normalizeText).filter(Boolean))];
}

function parseMetadataBlock(content, openMarker, filePath) {
  const openIndex = content.indexOf(openMarker);
  if (openIndex < NUM_ZERO) {
    throw new Error(`${filePath}: ${openMarker} metadata block is required.`);
  }
  const jsonStart = openIndex + openMarker.length;
  const closeIndex = content.indexOf(METADATA_CLOSE, jsonStart);
  if (closeIndex < NUM_ZERO) {
    throw new Error(`${filePath}: metadata closing marker is missing.`);
  }
  try {
    return JSON.parse(content.slice(jsonStart, closeIndex).trim());
  } catch (error) {
    throw new Error(`${filePath}: metadata is not valid JSON: ${error.message}`);
  }
}

function readJsonMetadata(content, filePath) {
  return normalizeMetadata(
    parseMetadataBlock(content, PACKAGE_METADATA_OPEN, filePath),
    filePath,
  );
}

async function readPackageMetadata(packagePath) {
  const content = await fs.readFile(packagePath, 'utf8');
  return {
    content,
    metadata: readJsonMetadata(content, packagePath),
  };
}

function parseAgentCardMetadata(content, filePath) {
  return parseMetadataBlock(content, AGENT_CARD_OPEN, filePath);
}

async function readAgentCard(cardPath) {
  const content = await fs.readFile(cardPath, 'utf8');
  return {
    path: cardPath,
    content,
    metadata: parseAgentCardMetadata(content, cardPath),
  };
}

async function resolveDefaultPackagePath() {
  const activeSprintFile = await findActiveSprintFile();
  const activePackageFile = await findActivePackageFile(activeSprintFile);
  if (!activePackageFile) {
    throw new Error('No active work package was found.');
  }
  return activePackageFile;
}

function parseOptionValue(args = [], optionName) {
  const index = args.indexOf(optionName);
  return index < NUM_ZERO ? EMPTY_TEXT : normalizeText(args[index + NUM_ONE]);
}

async function resolvePackagePath(args = []) {
  return parseOptionValue(args, '--package') || await resolveDefaultPackagePath();
}

function getParallelDiagnostics(metadata = {}) {
  return metadata[PARALLEL_DIAGNOSTICS_FIELD];
}

function expectedModeForRole(role) {
  return role === ROLE_VERIFIER ? CARD_MODE_VERIFY_ONLY : CARD_MODE_READ_ONLY;
}

function roleFileName(role) {
  return `${role}.md`;
}

function reportPathForRole(reportDir, role) {
  return path.join(reportDir, roleFileName(role)).replace(/\\/gu, '/');
}

function localPathExists(value) {
  const normalized = normalizePathText(value);
  if (normalized.length === NUM_ZERO || normalized === 'none') {
    return true;
  }
  if (!LOCAL_PATH_PATTERN.test(normalized)) {
    return true;
  }
  return fsSync.existsSync(normalized);
}

function validateLocalPathList(errors, filePath, card, fieldName) {
  const values = card[fieldName];
  if (values === undefined) {
    return;
  }
  if (!Array.isArray(values)) {
    errors.push(`${filePath}: ${fieldName} must be an array.`);
    return;
  }
  for (const value of values) {
    if (!localPathExists(value)) {
      errors.push(`${filePath}: ${fieldName} path does not exist: ${value}`);
    }
  }
}

function validateCardCommon(filePath, card, expectedPackage) {
  const errors = [];
  if (!isObjectRecord(card)) {
    return [`${filePath}: agent route card metadata must be an object.`];
  }
  if (card.schema !== SCHEMA_AGENT_ROUTE_CARD) {
    errors.push(
      `${filePath}: schema must be ${SCHEMA_AGENT_ROUTE_CARD}.`,
    );
  }
  if (normalizePathText(card.package) !== normalizePathText(expectedPackage)) {
    errors.push(`${filePath}: package must reference ${expectedPackage}.`);
  }
  if (!CARD_ROLES.includes(card.agentRole)) {
    errors.push(`${filePath}: agentRole must be one of ${CARD_ROLES.join(', ')}.`);
  }
  if (!CARD_MODES.includes(card.mode)) {
    errors.push(`${filePath}: mode must be one of ${CARD_MODES.join(', ')}.`);
  }
  if (card.status !== CARD_STATUS_COMPLETE) {
    errors.push(`${filePath}: status must be ${CARD_STATUS_COMPLETE}.`);
  }
  if (!RECOMMENDED_ROUTES.includes(card.recommendedRoute)) {
    errors.push(
      `${filePath}: recommendedRoute must be one of ` +
        `${RECOMMENDED_ROUTES.join(', ')}.`,
    );
  }
  if (!CARD_CONFIDENCE_VALUES.includes(card.confidence)) {
    errors.push(
      `${filePath}: confidence must be one of ` +
        `${CARD_CONFIDENCE_VALUES.join(', ')}.`,
    );
  }
  if (normalizeText(card.ownerBoundary).length === NUM_ZERO) {
    errors.push(`${filePath}: ownerBoundary must name a route or explicit non-route.`);
  }
  if (normalizeText(card.rationale).length === NUM_ZERO) {
    errors.push(`${filePath}: rationale must be a non-empty string.`);
  }
  if (!Array.isArray(card.evidenceUsed) || card.evidenceUsed.length === NUM_ZERO) {
    errors.push(`${filePath}: evidenceUsed must be a non-empty array.`);
  }
  validateLocalPathList(errors, filePath, card, 'evidenceUsed');
  return errors;
}

function validateReadOnlyScout(filePath, card) {
  const errors = [];
  if (!SCOUT_ROLES.includes(card.agentRole)) {
    return errors;
  }
  if (card.mode !== CARD_MODE_READ_ONLY) {
    errors.push(`${filePath}: scout cards must use mode ${CARD_MODE_READ_ONLY}.`);
  }
  const mustNotEdit = Array.isArray(card.mustNotEdit) ? card.mustNotEdit : [];
  if (!mustNotEdit.includes('src/')) {
    errors.push(`${filePath}: scout cards must include src/ in mustNotEdit.`);
  }
  const writesAllowed = Array.isArray(card.writesAllowed) ?
    card.writesAllowed.filter((entry) => normalizeText(entry).length > NUM_ZERO) :
    [];
  if (writesAllowed.length > NUM_ZERO) {
    errors.push(`${filePath}: scout cards must not allow writes.`);
  }
  for (const fieldName of SCOUT_FORBIDDEN_WRITE_FIELDS) {
    if (card[fieldName] !== undefined) {
      errors.push(`${filePath}: scout cards must not declare ${fieldName}.`);
    }
  }
  return errors;
}

function validateRoleSpecificCard(filePath, card) {
  const errors = [];
  if (card.mode !== expectedModeForRole(card.agentRole)) {
    errors.push(
      `${filePath}: ${card.agentRole} must use mode ` +
        `${expectedModeForRole(card.agentRole)}.`,
    );
  }
  if (card.agentRole === ROLE_EVIDENCE_SCOUT) {
    if (!STALENESS_RISK_VALUES.includes(card.stalenessRisk)) {
      errors.push(
        `${filePath}: stalenessRisk must be one of ` +
          `${STALENESS_RISK_VALUES.join(', ')}.`,
      );
    }
  }
  if (card.agentRole === ROLE_MODEL_CONTRACT_SCOUT) {
    const contractRefs = Array.isArray(card.contractRefs) ? card.contractRefs : [];
    const modelRefs = Array.isArray(card.modelRefs) ? card.modelRefs : [];
    if (contractRefs.length + modelRefs.length === NUM_ZERO) {
      errors.push(`${filePath}: model-contract-scout must cite contractRefs or modelRefs.`);
    }
    validateLocalPathList(errors, filePath, card, 'contractRefs');
    validateLocalPathList(errors, filePath, card, 'modelRefs');
  }
  if (card.agentRole === ROLE_SOURCE_MAP_SCOUT) {
    if (!Array.isArray(card.candidateFiles) || card.candidateFiles.length === NUM_ZERO) {
      errors.push(`${filePath}: source-map-scout must list candidateFiles.`);
    }
    validateLocalPathList(errors, filePath, card, 'candidateFiles');
  }
  if (card.agentRole === ROLE_VERIFIER) {
    if (card.mode !== CARD_MODE_VERIFY_ONLY) {
      errors.push(`${filePath}: verifier cards must use mode ${CARD_MODE_VERIFY_ONLY}.`);
    }
    if (!Array.isArray(card.checkedCommands) || card.checkedCommands.length === NUM_ZERO) {
      errors.push(`${filePath}: verifier cards must list checkedCommands.`);
    }
    if (!Array.isArray(card.findings)) {
      errors.push(`${filePath}: verifier cards must list findings, even when empty.`);
    }
  }
  return errors;
}

function validateAgentCardMetadata(filePath, card, expectedPackage) {
  return [
    ...validateCardCommon(filePath, card, expectedPackage),
    ...validateReadOnlyScout(filePath, card),
    ...validateRoleSpecificCard(filePath, card),
  ];
}

function validateParallelDiagnostics(packagePath, metadata = {}) {
  const diagnostics = getParallelDiagnostics(metadata);
  if (diagnostics === undefined) {
    return [];
  }
  const errors = [];
  if (!isObjectRecord(diagnostics)) {
    return [`${packagePath}: parallelDiagnostics must be an object.`];
  }
  if (!DIAGNOSTIC_MODES.includes(diagnostics.mode)) {
    errors.push(
      `${packagePath}: parallelDiagnostics.mode must be one of ` +
        `${DIAGNOSTIC_MODES.join(', ')}.`,
    );
  }
  const requiredCards = diagnostics.requiredCards;
  if (!Array.isArray(requiredCards)) {
    errors.push(`${packagePath}: parallelDiagnostics.requiredCards must be an array.`);
  } else if (
    diagnostics.mode !== DIAGNOSTIC_MODE_NONE &&
    requiredCards.length === NUM_ZERO
  ) {
    errors.push(`${packagePath}: parallelDiagnostics.requiredCards must not be empty.`);
  } else {
    for (const role of requiredCards) {
      if (!CARD_ROLES.includes(role)) {
        errors.push(`${packagePath}: unknown parallelDiagnostics role ${role}.`);
      }
      if (
        diagnostics.mode === DIAGNOSTIC_MODE_READ_ONLY_SCOUTS &&
        !SCOUT_ROLES.includes(role)
      ) {
        errors.push(`${packagePath}: read-only-scouts mode may require only scout roles.`);
      }
      if (
        diagnostics.mode === DIAGNOSTIC_MODE_VERIFY_ONLY &&
        role !== ROLE_VERIFIER
      ) {
        errors.push(`${packagePath}: verify-only mode may require only verifier.`);
      }
    }
  }
  const reportDir = normalizePathText(diagnostics.reportDir);
  if (!reportDir.startsWith(REPORT_DIR_PREFIX)) {
    errors.push(
      `${packagePath}: parallelDiagnostics.reportDir must be under ` +
        `${REPORT_DIR_PREFIX}.`,
    );
  }
  if (!Array.isArray(diagnostics.coordinatorOnlyWrites)) {
    errors.push(
      `${packagePath}: parallelDiagnostics.coordinatorOnlyWrites must be an array.`,
    );
  }
  if (typeof diagnostics.routeDecisionRequired !== 'boolean') {
    errors.push(
      `${packagePath}: parallelDiagnostics.routeDecisionRequired must be boolean.`,
    );
  }
  return errors;
}

async function loadAgentReports(packagePath, metadata) {
  const diagnostics = getParallelDiagnostics(metadata);
  const reportDir = normalizePathText(diagnostics?.reportDir);
  const requiredCards = Array.isArray(diagnostics?.requiredCards) ?
    diagnostics.requiredCards :
    [];
  const cards = [];
  const missing = [];
  for (const role of requiredCards) {
    const cardPath = reportPathForRole(reportDir, role);
    try {
      cards.push(await readAgentCard(cardPath));
    } catch (error) {
      if (error.code === 'ENOENT') {
        missing.push({role, path: cardPath});
      } else {
        cards.push({
          path: cardPath,
          metadata: null,
          readError: error.message,
        });
      }
    }
  }
  return {packagePath, reportDir, requiredCards, cards, missing};
}

async function validateAgentReports(packagePath, options = {}) {
  const {metadata} = await readPackageMetadata(packagePath);
  const diagnosticsErrors = validateParallelDiagnostics(packagePath, metadata);
  const diagnostics = getParallelDiagnostics(metadata);
  if (diagnosticsErrors.length > NUM_ZERO || diagnostics === undefined) {
    return {
      metadata,
      diagnostics,
      reportDir: normalizePathText(diagnostics?.reportDir),
      cards: [],
      missing: [],
      errors: diagnosticsErrors,
    };
  }
  const loaded = await loadAgentReports(packagePath, metadata);
  const errors = [...diagnosticsErrors];
  if (!options.allowMissing) {
    for (const missing of loaded.missing) {
      errors.push(`${packagePath}: missing ${missing.role} card at ${missing.path}.`);
    }
  }
  const seenRoles = new Set();
  for (const card of loaded.cards) {
    if (card.readError) {
      errors.push(`${card.path}: ${card.readError}`);
      continue;
    }
    errors.push(
      ...validateAgentCardMetadata(card.path, card.metadata, packagePath),
    );
    if (seenRoles.has(card.metadata?.agentRole)) {
      errors.push(`${card.path}: duplicate card role ${card.metadata.agentRole}.`);
    }
    seenRoles.add(card.metadata?.agentRole);
  }
  return {
    metadata,
    diagnostics,
    ...loaded,
    errors,
  };
}

function summarizeCard(card) {
  const metadata = card.metadata || {};
  return {
    role: metadata.agentRole || DEFAULT_UNKNOWN,
    route: metadata.recommendedRoute || DEFAULT_UNKNOWN,
    confidence: metadata.confidence || DEFAULT_UNKNOWN,
    ownerBoundary: metadata.ownerBoundary || DEFAULT_UNKNOWN,
    rationale: metadata.rationale || DEFAULT_UNKNOWN,
    path: card.path,
  };
}

function buildCollectLines(packagePath, validation) {
  const diagnostics = validation.diagnostics;
  const lines = [
    `Package: ${packagePath}`,
    EMPTY_TEXT,
  ];
  if (diagnostics === undefined) {
    lines.push('Parallel diagnostics: not configured.');
    return lines;
  }
  lines.push(
    `Mode: ${diagnostics.mode}`,
    `Report dir: ${validation.reportDir}`,
    `Route decision required: ${diagnostics.routeDecisionRequired}`,
    EMPTY_TEXT,
    '## Route Cards',
    EMPTY_TEXT,
  );
  for (const missing of validation.missing) {
    lines.push(
      `${missing.role}:`,
      '  status: missing',
      `  path: ${missing.path}`,
      EMPTY_TEXT,
    );
  }
  for (const card of validation.cards) {
    if (card.readError) {
      lines.push(`${card.path}: ${card.readError}`, EMPTY_TEXT);
      continue;
    }
    const summary = summarizeCard(card);
    lines.push(
      `${summary.role}:`,
      `  route: ${summary.route}`,
      `  confidence: ${summary.confidence}`,
      `  owner: ${summary.ownerBoundary}`,
      `  path: ${summary.path}`,
      `  reason: ${summary.rationale}`,
      EMPTY_TEXT,
    );
  }
  const routes = uniqueValues(
    validation.cards
      .filter((card) => !card.readError)
      .map((card) => card.metadata?.recommendedRoute),
  );
  lines.push('## Coordinator Decision');
  if (validation.missing.length > NUM_ZERO) {
    lines.push('Status: pending; required route cards are missing.');
  } else if (routes.length > NUM_ONE) {
    lines.push(
      `Status: disagreement present across routes: ${routes.join(', ')}.`,
    );
  } else if (routes.length === NUM_ONE) {
    lines.push(`Status: route consensus on ${routes[NUM_ZERO]}.`);
  } else {
    lines.push('Status: no route cards loaded.');
  }
  if (validation.errors.length > NUM_ZERO) {
    lines.push(EMPTY_TEXT, '## Validation Errors', EMPTY_TEXT);
    for (const error of validation.errors) {
      lines.push(`- ${error}`);
    }
  }
  return lines;
}

function promptForRole(role, packagePath, diagnostics = {}) {
  const reportDir = normalizePathText(diagnostics.reportDir);
  const cardPath = reportPathForRole(reportDir, role);
  const shared = [
    `Package: ${packagePath}`,
    `Write exactly one route card: ${cardPath}`,
    'Do not edit workflow state, sprint status, current-blocker, package status, or source code.',
    'Use the route-card template and fill complete metadata.',
  ];
  const byRole = {
    [ROLE_EVIDENCE_SCOUT]:
      'Decide whether the current evidence is stale, accepted, causal, contradictory, or green-capable.',
    [ROLE_MODEL_CONTRACT_SCOUT]:
      'Check whether contract records, model specs, decision tables, statecharts, or TLA+ support the next route.',
    [ROLE_SOURCE_MAP_SCOUT]:
      'Map the selected owner/boundary to candidate source files without editing them.',
    [ROLE_VERIFIER]:
      'Verify the implemented package/tooling changes and write a verifier card with findings and checked commands.',
  };
  return [...shared, byRole[role] || 'Produce a bounded route card.'].join(NEWLINE);
}

function buildPlanLines(packagePath, metadata) {
  const diagnostics = getParallelDiagnostics(metadata);
  const lines = [`Package: ${packagePath}`, EMPTY_TEXT];
  if (diagnostics === undefined) {
    lines.push('Parallel diagnostics: not configured.');
    return lines;
  }
  lines.push(
    `Mode: ${diagnostics.mode}`,
    `Report dir: ${diagnostics.reportDir}`,
    `Trigger: ${diagnostics.trigger || 'manual'}`,
    EMPTY_TEXT,
    '## Required Cards',
    EMPTY_TEXT,
  );
  for (const role of diagnostics.requiredCards || []) {
    lines.push(
      `### ${role}`,
      EMPTY_TEXT,
      `Path: ${reportPathForRole(diagnostics.reportDir, role)}`,
      EMPTY_TEXT,
      'Prompt:',
      EMPTY_TEXT,
      promptForRole(role, packagePath, diagnostics),
      EMPTY_TEXT,
    );
  }
  return lines;
}

export {
  CARD_ROLES,
  RECOMMENDED_ROUTES,
  SCHEMA_AGENT_ROUTE_CARD,
  buildCollectLines,
  buildPlanLines,
  getParallelDiagnostics,
  parseAgentCardMetadata,
  readPackageMetadata,
  resolvePackagePath,
  validateAgentCardMetadata,
  validateAgentReports,
  validateParallelDiagnostics,
};
