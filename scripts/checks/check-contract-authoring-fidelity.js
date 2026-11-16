#!/usr/bin/env node
/**
 * Pure ES6 AST checker for contract-first authoring and producer fidelity.
 *
 * Uses espree and eslint-visitor-keys to verify that producer factories and
 * consumer boundaries adhere strictly to their declared canonical record keys
 * (PartitionLocalServiceStatusRecord and StatementWriteFootprintRecord),
 * rejecting phantom properties on both producer literals and consumer accesses.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {parse} from 'espree';
import {KEYS} from 'eslint-visitor-keys';
import {
  PARTITION_LOCAL_SERVICE_STATUS_KEYS,
} from '../../src/partition/partition-local-service-status-contract.js';
import {
  STATEMENT_WRITE_FOOTPRINT_KEYS,
} from '../../src/partition/partition-write-footprint-contract.js';

const objectFreeze = Object.freeze;
const objectEntries = Object.entries;
const objectKeys = Object.keys;
const objectHasOwn = Object.hasOwn;

const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arraySome = Function.call.bind(Array.prototype.some);

const NUM_ZERO = 0;
const NUM_ONE = 1;
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const MSG_PASSED = 'Contract boundary check passed: 0 diagnostics.\n';
const TEXT_ENCODING = 'utf8';

const DIAGNOSTIC_CODE = objectFreeze({
  PARSE_ERROR: 1005,
  PROPERTY_NOT_EXIST: 2339,
  EXCESS_PROPERTY: 2353,
});

const PARSE_OPTIONS = objectFreeze({
  ecmaVersion: 'latest',
  sourceType: 'module',
  loc: true,
  range: true,
});

const NODE_TYPE = objectFreeze({
  CALL: 'CallExpression',
  FUNCTION_DECL: 'FunctionDeclaration',
  IDENTIFIER: 'Identifier',
  MEMBER: 'MemberExpression',
  OBJECT_EXPR: 'ObjectExpression',
  OBJECT_PATTERN: 'ObjectPattern',
  PROPERTY: 'Property',
  VAR_DECLARATOR: 'VariableDeclarator',
});

const DEFAULT_TARGET_PRODUCER =
  'src/partition/partition-local-service-status-contract.js';
const DEFAULT_TARGET_CONSUMER =
  'src/bootstrap/owners/partition-quorum-authority.js';
const WRITE_FOOTPRINT_TARGET_PRODUCER =
  'src/partition/partition-write-footprint-contract.js';
const WRITE_FOOTPRINT_TARGET_CONSUMER =
  'src/partition/partition-participant-transaction-session.js';

const DEFAULT_ROOT_FILES = objectFreeze([
  DEFAULT_TARGET_PRODUCER,
  DEFAULT_TARGET_CONSUMER,
  WRITE_FOOTPRINT_TARGET_PRODUCER,
  WRITE_FOOTPRINT_TARGET_CONSUMER,
]);

const BOUNDARY_SPECS = objectFreeze([
  objectFreeze({
    recordName: 'PartitionLocalServiceStatusRecord',
    producerFile: DEFAULT_TARGET_PRODUCER,
    producerFactoryNames: objectFreeze(['createPartitionLocalServiceStatusRecord']),
    consumerFile: DEFAULT_TARGET_CONSUMER,
    consumerCallNames: objectFreeze([
      'getStatus',
      'readCanonicalLocalServiceStatus',
      'assertPartitionLocalServiceStatusConformance',
    ]),
    allowedKeys: PARTITION_LOCAL_SERVICE_STATUS_KEYS,
  }),
  objectFreeze({
    recordName: 'StatementWriteFootprintRecord',
    producerFile: WRITE_FOOTPRINT_TARGET_PRODUCER,
    producerFactoryNames: objectFreeze(['createStatementWriteFootprintRecord']),
    consumerFile: WRITE_FOOTPRINT_TARGET_CONSUMER,
    consumerCallNames: objectFreeze([
      'extractStatementWriteFootprint',
      'createStatementWriteFootprintRecord',
      'assertStatementWriteFootprintConformance',
    ]),
    allowedKeys: STATEMENT_WRITE_FOOTPRINT_KEYS,
  }),
]);

function matchesOverridePath(filePath, overridePath) {
  const normalizedFile = path.resolve(filePath);
  const normalizedOverride = path.resolve(overridePath);
  return normalizedFile === normalizedOverride ||
    stringEndsWith(filePath, overridePath) ||
    stringEndsWith(overridePath, filePath);
}

function findMatchingOverride(filePath, sourceOverrides) {
  const entries = objectEntries(sourceOverrides);
  for (let i = NUM_ZERO; i < entries.length; i += NUM_ONE) {
    const [overridePath, content] = entries[i];
    if (matchesOverridePath(filePath, overridePath)) {
      return content;
    }
  }
  return null;
}

function readEffectiveSource(filePath, sourceOverrides) {
  const overridden = findMatchingOverride(filePath, sourceOverrides);
  if (overridden !== null) {
    return overridden;
  }
  return fs.readFileSync(path.resolve(filePath), TEXT_ENCODING);
}

function resolveEffectiveTargetFiles(targetFiles, sourceOverrides) {
  if (Array.isArray(targetFiles) && targetFiles.length > NUM_ZERO) {
    return targetFiles;
  }
  const overrideKeys = objectKeys(sourceOverrides);
  if (overrideKeys.length > NUM_ZERO) {
    return [...DEFAULT_ROOT_FILES, ...overrideKeys];
  }
  return DEFAULT_ROOT_FILES;
}

function walkAst(node, visitor, parent = null) {
  if (!node || typeof node.type !== 'string') {
    return;
  }
  visitor(node, parent);
  const keys = KEYS[node.type] || [];
  for (let i = NUM_ZERO; i < keys.length; i += NUM_ONE) {
    const child = node[keys[i]];
    if (Array.isArray(child)) {
      for (let j = NUM_ZERO; j < child.length; j += NUM_ONE) {
        if (child[j] && typeof child[j].type === 'string') {
          walkAst(child[j], visitor, node);
        }
      }
    } else if (child && typeof child.type === 'string') {
      walkAst(child, visitor, node);
    }
  }
}

function extractPropertyKeyName(prop) {
  if (!prop || prop.type !== NODE_TYPE.PROPERTY || prop.computed) {
    return null;
  }
  if (prop.key?.type === NODE_TYPE.IDENTIFIER) {
    return prop.key.name;
  }
  if (typeof prop.key?.value === 'string') {
    return prop.key.value;
  }
  return null;
}

function checkProducerAst(ast, spec, diagnostics) {
  walkAst(ast, (node) => {
    if (
      node.type !== NODE_TYPE.FUNCTION_DECL ||
      !arrayIncludes(spec.producerFactoryNames, node.id?.name)
    ) {
      return;
    }
    walkAst(node.body, (inner) => {
      if (inner.type !== NODE_TYPE.OBJECT_EXPR) {
        return;
      }
      const props = inner.properties || [];
      for (let i = NUM_ZERO; i < props.length; i += NUM_ONE) {
        const keyName = extractPropertyKeyName(props[i]);
        if (keyName !== null && !arrayIncludes(spec.allowedKeys, keyName)) {
          diagnostics.push({
            code: DIAGNOSTIC_CODE.EXCESS_PROPERTY,
            message:
              `Object literal may only specify known properties, and '${keyName}' ` +
              `does not exist in type '${spec.recordName}'.`,
            file: spec.producerFile,
            line: props[i].loc?.start?.line ?? null,
          });
        }
      }
    });
  });
}

function extractCalleeName(callNode) {
  if (!callNode || callNode.type !== NODE_TYPE.CALL) {
    return null;
  }
  if (callNode.callee?.type === NODE_TYPE.IDENTIFIER) {
    return callNode.callee.name;
  }
  if (
    callNode.callee?.type === NODE_TYPE.MEMBER &&
    !callNode.callee.computed &&
    callNode.callee.property?.type === NODE_TYPE.IDENTIFIER
  ) {
    return callNode.callee.property.name;
  }
  return null;
}

function collectConsumerRecordBindings(ast, spec, diagnostics) {
  const boundNames = new Set();
  walkAst(ast, (node) => {
    if (node.type !== NODE_TYPE.VAR_DECLARATOR || !node.init) {
      return;
    }
    const calleeName = extractCalleeName(node.init);
    if (!calleeName || !arrayIncludes(spec.consumerCallNames, calleeName)) {
      return;
    }
    if (node.id?.type === NODE_TYPE.IDENTIFIER) {
      boundNames.add(node.id.name);
      return;
    }
    if (node.id?.type === NODE_TYPE.OBJECT_PATTERN) {
      const props = node.id.properties || [];
      for (let i = NUM_ZERO; i < props.length; i += NUM_ONE) {
        const keyName = extractPropertyKeyName(props[i]);
        if (keyName !== null && !arrayIncludes(spec.allowedKeys, keyName)) {
          diagnostics.push({
            code: DIAGNOSTIC_CODE.PROPERTY_NOT_EXIST,
            message: `Property '${keyName}' does not exist on type '${spec.recordName}'.`,
            file: spec.consumerFile,
            line: props[i].loc?.start?.line ?? null,
          });
        }
      }
    }
  });
  return boundNames;
}

function checkConsumerAst(ast, spec, diagnostics) {
  const boundNames = collectConsumerRecordBindings(ast, spec, diagnostics);
  if (boundNames.size === NUM_ZERO) {
    return;
  }
  walkAst(ast, (node) => {
    if (
      node.type !== NODE_TYPE.MEMBER ||
      node.computed ||
      node.object?.type !== NODE_TYPE.IDENTIFIER ||
      !boundNames.has(node.object.name) ||
      node.property?.type !== NODE_TYPE.IDENTIFIER
    ) {
      return;
    }
    const propName = node.property.name;
    if (objectHasOwn(Object.prototype, propName)) {
      return;
    }
    if (!arrayIncludes(spec.allowedKeys, propName)) {
      diagnostics.push({
        code: DIAGNOSTIC_CODE.PROPERTY_NOT_EXIST,
        message: `Property '${propName}' does not exist on type '${spec.recordName}'.`,
        file: spec.consumerFile,
        line: node.property.loc?.start?.line ?? null,
      });
    }
  });
}

function parseFileForCheck(filePath, sourceOverrides, diagnostics) {
  try {
    const source = readEffectiveSource(filePath, sourceOverrides);
    return parse(source, PARSE_OPTIONS);
  } catch (error) {
    diagnostics.push({
      code: DIAGNOSTIC_CODE.PARSE_ERROR,
      message: String(error?.message ?? error),
      file: filePath,
      line: error?.lineNumber ?? null,
    });
    return null;
  }
}

/**
 * Programmatically verify ES6 AST contract conformance on producer and consumer files.
 *
 * @param {Object} [options]
 * @param {Record<string, string>} [options.sourceOverrides]
 * @param {string[]} [options.targetFiles]
 * @param {string[]} [options.rootFiles]
 * @return {{passed: boolean, diagnostics: Array<{code: number, message: string, file: string|null, line: number|null}>}}
 */
function verifyContractBoundaryTypecheck(options = {}) {
  const sourceOverrides = options.sourceOverrides ?? {};
  const effectiveTargets = resolveEffectiveTargetFiles(
    options.targetFiles,
    sourceOverrides,
  );
  const allDiagnostics = [];

  for (let i = NUM_ZERO; i < BOUNDARY_SPECS.length; i += NUM_ONE) {
    const spec = BOUNDARY_SPECS[i];
    const producerAst = parseFileForCheck(
      spec.producerFile,
      sourceOverrides,
      allDiagnostics,
    );
    if (producerAst !== null) {
      checkProducerAst(producerAst, spec, allDiagnostics);
    }
    const consumerAst = parseFileForCheck(
      spec.consumerFile,
      sourceOverrides,
      allDiagnostics,
    );
    if (consumerAst !== null) {
      checkConsumerAst(consumerAst, spec, allDiagnostics);
    }
  }

  const filteredDiagnostics = arrayFilter(allDiagnostics, (diagnostic) => {
    const fileName = diagnostic.file;
    if (!fileName) {
      return false;
    }
    return arraySome(effectiveTargets, (target) => matchesOverridePath(fileName, target));
  });

  return {
    passed: filteredDiagnostics.length === NUM_ZERO,
    diagnostics: filteredDiagnostics,
  };
}

function main() {
  const result = verifyContractBoundaryTypecheck();
  if (result.passed) {
    process.stdout.write(MSG_PASSED);
    process.exit(EXIT_SUCCESS);
  }
  for (let i = NUM_ZERO; i < result.diagnostics.length; i += NUM_ONE) {
    const diag = result.diagnostics[i];
    process.stderr.write(
      `${diag.file}:${diag.line} error ${diag.code}: ${diag.message}\n`,
    );
  }
  process.exit(EXIT_FAILURE);
}

const currentScriptPath = fileURLToPath(import.meta.url);
if (process.argv[NUM_ONE] && path.resolve(process.argv[NUM_ONE]) === currentScriptPath) {
  main();
}

export {
  verifyContractBoundaryTypecheck,
  DEFAULT_ROOT_FILES,
};
