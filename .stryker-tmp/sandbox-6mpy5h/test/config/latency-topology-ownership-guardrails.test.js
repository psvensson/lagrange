// @ts-nocheck
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import {test} from '../../src/test-helpers/tap.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SRC_ROOT = path.join(__dirname, '../../src');

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

function srcRelative(fullPath) {
  return path.relative(SRC_ROOT, fullPath).split(path.sep).join('/');
}

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
      });
      if (re.lastIndex === match.index) {
        re.lastIndex++;
      }
    }
  }

  return matches;
}

test('Latency topology owner construction sites are constrained', async (t) => {
  const guardrails = [
    {
      name: 'GroupSelectionService constructor',
      regex: /new\s+GroupSelectionService\s*\(/,
    },
    {
      name: 'LatencyMeasurementService constructor',
      regex: /new\s+LatencyMeasurementService\s*\(/,
    },
    {
      name: 'LatencyGroupManager constructor',
      regex: /new\s+LatencyGroupManager\s*\(/,
    },
    {
      name: 'LatencyTreeService constructor',
      regex: /new\s+LatencyTreeService\s*\(/,
    },
    {
      name: 'CDCGroupPropagationService constructor',
      regex: /new\s+CDCGroupPropagationService\s*\(/,
    },
  ];
  const allowedFile = 'bootstrap/shared/latency-topology-setup.js';

  for (const guardrail of guardrails) {
    const matches = findMatches(guardrail.regex, (file) => {
      return file.startsWith('bootstrap/') || file.startsWith('topology/');
    });
    const violations = matches.filter((match) => match.file !== allowedFile);

    t.equal(
      violations.length,
      0,
      `${guardrail.name} should only be created in ${allowedFile}. ` +
        `Violations: ${JSON.stringify(violations)}`,
    );
    t.equal(
      matches.length,
      1,
      `${guardrail.name} should have exactly one owner construction site`,
    );
  }
});

test('LatencyTopologySetup usage is constrained to bootstrap/joining owners',
  async (t) => {
    const calls = findMatches(
      /LatencyTopologySetup\.(?:create|start|stop)\s*\(/,
      (file) => file.startsWith('bootstrap/'),
    );
    const allowedFiles = new Set([
      'bootstrap/bootstrap-service.js',
      'bootstrap/node-joining-service.js',
      'bootstrap/join-cleanup-handler.js',
      'bootstrap/owners/seed-runtime-bridge-owner.js',
      'bootstrap/phases/seed-cache-hydration-phase.js',
      'bootstrap/phases/seed-cleanup-handler.js',
    ]);
    const violations = calls.filter((match) => !allowedFiles.has(match.file));

    t.equal(
      violations.length,
      0,
      'LatencyTopologySetup should only be used by bootstrap/join owners. ' +
        `Violations: ${JSON.stringify(violations)}`,
    );
    t.ok(
      calls.length >= 2,
      'Expected LatencyTopologySetup usage in bootstrap and joining owners',
    );
  });
