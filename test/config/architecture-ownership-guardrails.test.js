/**
 * Architecture ownership guardrails.
 *
 * Validates baseline ownership constraints for consolidation work:
 * 1. Setup-owned component construction sites are constrained.
 * 2. System-cache primary-key map definitions are constrained.
 * 3. Runtime startup wiring creation sites are constrained.
 */

import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import {test} from '../../src/test-helpers/tap.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SRC_ROOT = path.join(__dirname, '../../src');

/**
 * Recursively collect source files.
 * @param {string} dir - Directory root.
 * @return {string[]} JS file paths.
 */
function getSourceFiles(dir) {
  const files = [];

  function scan(currentDir) {
    const entries = fs.readdirSync(currentDir, {withFileTypes: true});
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        scan(fullPath);
      } else if (entry.name.endsWith('.js')) {
        files.push(fullPath);
      }
    }
  }

  scan(dir);
  return files;
}

/**
 * Normalize source-relative paths for stable assertions.
 * @param {string} fullPath - Absolute path.
 * @return {string} src-relative path with forward slashes.
 */
function srcRelative(fullPath) {
  return path.relative(SRC_ROOT, fullPath).split(path.sep).join('/');
}

/**
 * Find regex matches across source files.
 * @param {RegExp} regex - Pattern to match.
 * @param {(file:string)=>boolean} includeFile - File include predicate.
 * @return {Array<Object>} Match objects.
 */
function findMatches(regex, includeFile = () => true) {
  const sourceFiles = getSourceFiles(SRC_ROOT);
  const matches = [];

  for (const file of sourceFiles) {
    const relFile = srcRelative(file);
    if (!includeFile(relFile)) {
      continue;
    }

    const content = fs.readFileSync(file, 'utf-8');
    const re = new RegExp(
      regex.source,
      regex.flags.includes('g') ? regex.flags : `${regex.flags}g`,
    );

    let match;
    while ((match = re.exec(content)) !== null) {
      const line = content.slice(0, match.index).split('\n').length;
      matches.push({
        file: relFile,
        line,
        text: match[0],
        captures: match.slice(1),
      });

      if (re.lastIndex === match.index) {
        re.lastIndex++;
      }
    }
  }

  return matches;
}

test('Ownership guardrails: setup creation sites are constrained', async (t) => {
  const setupGuardrails = [
    {
      name: 'MessageRouter constructor',
      regex: /new\s+MessageRouter\s*\(/,
      allowedFiles: new Set([
        'bootstrap/phases/infrastructure-phase.js',
        'bootstrap/shared/message-router-setup.js',
      ]),
    },
    {
      name: 'CDCIntegrationService constructor',
      regex: /new\s+CDCIntegrationService\s*\(/,
      allowedFiles: new Set([
        'bootstrap/shared/cdc-integration-setup.js',
      ]),
    },
    {
      name: 'RebalanceCoordinator constructor',
      regex: /new\s+RebalanceCoordinator\s*\(/,
      allowedFiles: new Set([
        'bootstrap/shared/control-plane-setup.js',
      ]),
    },
    {
      name: 'HeartbeatService constructor',
      regex: /new\s+HeartbeatService\s*\(/,
      allowedFiles: new Set([
        'bootstrap/shared/control-plane-setup.js',
      ]),
    },
    {
      name: 'LeaseService constructor',
      regex: /new\s+LeaseService\s*\(/,
      allowedFiles: new Set([
        'bootstrap/shared/control-plane-setup.js',
      ]),
    },
    {
      name: 'EndpointService constructor',
      regex: /new\s+EndpointService\s*\(/,
      allowedFiles: new Set([
        'bootstrap/shared/control-plane-setup.js',
      ]),
    },
    {
      name: 'ReplicaDispatchService constructor',
      regex: /new\s+ReplicaDispatchService\s*\(/,
      allowedFiles: new Set([
        'bootstrap/shared/control-plane-setup.js',
      ]),
    },
  ];

  for (const guardrail of setupGuardrails) {
    const matches = findMatches(guardrail.regex, (file) =>
      file.startsWith('bootstrap/'),
    );

    const violations = matches.filter((match) => {
      return !guardrail.allowedFiles.has(match.file);
    });

    t.equal(
      violations.length,
      0,
      `${guardrail.name} should only appear in allowed bootstrap files. ` +
        `Violations: ${JSON.stringify(violations)}`,
    );

    t.ok(
      matches.length > 0,
      `${guardrail.name} should have at least one call site to guard`,
    );
  }
});

test('Ownership guardrails: primary-key map definitions are constrained', async (t) => {
  const keyMapDefinitions = findMatches(
    /const\s+((?:CACHE_PRIMARY_KEY_FIELDS|PRIMARY_KEY_COLUMNS|SYSTEM_CACHE_KEY_DESCRIPTOR))\s*=\s*Object\.freeze\(\{/,
    (file) => {
      return file.startsWith('cache/') ||
        file.startsWith('worker/') ||
        file.startsWith('bootstrap/') ||
        file.startsWith('query/');
    },
  );

  const allowedDefinitions = new Set([
    'cache/system-cache-key-descriptor.js:SYSTEM_CACHE_KEY_DESCRIPTOR',
  ]);

  const violations = keyMapDefinitions.filter((definition) => {
    const constantName = definition.captures[0] || '';
    const descriptor = `${definition.file}:${constantName}`;
    return !allowedDefinitions.has(descriptor);
  });

  t.equal(
    violations.length,
    0,
    'Primary-key map definitions should be constrained to canonical files. ' +
      `Violations: ${JSON.stringify(violations)}`,
  );

  const seenDefinitions = new Set(keyMapDefinitions.map((definition) => {
    return `${definition.file}:${definition.captures[0] || ''}`;
  }));

  t.equal(
    seenDefinitions.size,
    allowedDefinitions.size,
    'Primary-key map definition count should match expected baseline',
  );
});

test('Ownership guardrails: runtime startup wiring creation is constrained', async (t) => {
  const matches = findMatches(/createRuntimeStartupWiring\s*\(/);

  const allowedFiles = new Set([
    'bootstrap/bootstrap-service.js',
    'bootstrap/node-joining-service.js',
    'runtime/runtime-startup-wiring.js',
  ]);

  const violations = matches.filter((match) => !allowedFiles.has(match.file));

  t.equal(
    violations.length,
    0,
    'createRuntimeStartupWiring() should only appear in constrained files. ' +
      `Violations: ${JSON.stringify(violations)}`,
  );

  const callbackMatches = matches.filter((match) => {
    return match.file === 'query/callback-runtime-driver-registry.js';
  });

  t.equal(
    callbackMatches.length,
    0,
    'Callback runtime registry must not create startup wiring implicitly',
  );
});
