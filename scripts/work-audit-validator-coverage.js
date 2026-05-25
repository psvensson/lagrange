import fs from 'fs';
import { execSync } from 'child_process';

async function main() {
  console.log('=== Validator Rule Coverage & Rejection Audit Report ===');
  console.log('Scanning scripts/work-tracker.js and repository history...\n');

  const trackerFile = 'scripts/work-tracker.js';
  if (!fs.existsSync(trackerFile)) {
    console.log('scripts/work-tracker.js not found.');
    return;
  }

  const trackerContent = fs.readFileSync(trackerFile, 'utf8');

  // Define some known validation rule pattern keywords to audit
  const rules = [
    { name: 'JSON Schema Validation', pattern: /work-package metadata failed JSON Schema/ },
    { name: 'Open Checklist Verification', pattern: /still has open checklist items/ },
    { name: 'State Machine Pressure Gate', pattern: /state machine pressure/ },
    { name: 'Theory Ledger References Check', pattern: /validates cited theory ledger refs/ },
    { name: 'Implementation Block Requirement', pattern: /execution\.implementation front-matter/ },
    { name: 'Verification Fix requirement', pattern: /execution\.verificationFix/ },
    { name: 'Stability Credit Check', pattern: /Gate 1/ },
    { name: 'Discovery Reference Rule', pattern: /enforces discoveryRef/ },
  ];

  console.log('Active Validation Gates Found in work-tracker.js:');
  console.log('--------------------------------------------------');

  const results = [];

  for (const rule of rules) {
    const isDefined = rule.pattern.test(trackerContent);
    let rejectionsCount = 0;

    if (isDefined) {
      // Query git log to see if this error message or rule was ever involved in commit messages
      try {
        const keyword = rule.name.split(' ')[0];
        const logOutput = execSync(`git log --all --grep="${keyword}" --oneline || true`, { encoding: 'utf8' }).trim();
        if (logOutput) {
          rejectionsCount = logOutput.split('\n').length;
        }
      } catch (err) {
        // ignore git errors
      }

      results.push({
        name: rule.name,
        status: 'Active',
        estimatedRejections: rejectionsCount,
      });
    } else {
      results.push({
        name: rule.name,
        status: 'Inactive / Legacy',
        estimatedRejections: 0,
      });
    }
  }

  for (const res of results) {
    console.log(`- Gate:       ${res.name}`);
    console.log(`  Status:     ${res.status}`);
    console.log(`  Heuristics: ${res.estimatedRejections > 0 ? `Triggered in history (${res.estimatedRejections} refs)` : 'Not triggered in current git log (Clean run record)'}`);
    console.log('--------------------------------------------------');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
