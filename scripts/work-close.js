import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import {normalizeMetadata} from './work-package-schema.js';
import {computeResidualCountFromArtifact} from './work-residual-count.js';
import {runSprintPush} from './work-sprint-push.js';

// R14 ceremony fold. Before closing, bind representativeResidual.residualCount to
// the real evidence artifact when the package names an artifact but left the
// count unrecorded. This keeps the artifact -> residualCount -> metricDelta chain
// of trust intact so the R14 consistency gate validates against measured data.
// Additive and best-effort: never throws; a missing/unreadable artifact or an
// already-present residualCount leaves the package untouched.
function autofillResidualCount(packagePath, relativePackagePath) {
  let content;
  try {
    content = fs.readFileSync(packagePath, 'utf8');
  } catch {
    return;
  }
  const openMarker = '<!-- work-package';
  const closeMarker = '-->';
  const openIndex = content.indexOf(openMarker);
  const closeIndex = content.indexOf(closeMarker, openIndex);
  if (openIndex === -1 || closeIndex === -1) return;
  const jsonText = content.slice(openIndex + openMarker.length, closeIndex).trim();
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return;
  }
  const residual = parsed?.representativeResidual;
  if (!residual || typeof residual !== 'object') return;
  const existing = residual.residualCount;
  if (existing !== undefined && existing !== null && existing !== '') return;
  const artifact = typeof residual.artifact === 'string' ? residual.artifact : '';
  if (!artifact) return;
  const count = computeResidualCountFromArtifact(artifact);
  if (!Number.isInteger(count) || count < 0) return;
  residual.residualCount = count;
  const nextJson = JSON.stringify(parsed, null, 2);
  const nextContent =
    content.slice(0, openIndex + openMarker.length) +
    `\n${nextJson}\n` +
    content.slice(closeIndex);
  try {
    fs.writeFileSync(packagePath, nextContent, 'utf8');
    console.log(
      `Bound representativeResidual.residualCount=${count} from artifact ` +
      `${artifact} in ${relativePackagePath}.`,
    );
  } catch {
    // best-effort
  }
}

function renumberSprintQueue(fileContent) {
  const lines = fileContent.split('\n');
  let currentNum = 1;
  let inQueue = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('## Package Queue')) {
      inQueue = true;
      continue;
    }
    if (inQueue && line.startsWith('## ')) {
      inQueue = false;
    }
    if (inQueue) {
      const match = line.match(/^(\s*)(\d+)\.\s+(\[.+)$/);
      if (match) {
        const indent = match[1];
        const rest = match[3];
        lines[i] = `${indent}${currentNum}. ${rest}`;
        currentNum++;
      }
    }
  }
  return lines.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const push = args.includes('--push');
  const packageArg = args.find((arg) => !arg.startsWith('--'));

  if (!packageArg) {
    console.error('Error: Package path is required.');
    process.exit(1);
  }

  const packagePath = path.resolve(packageArg);
  if (!fs.existsSync(packagePath)) {
    console.error(`Error: Package file not found at ${packagePath}`);
    process.exit(1);
  }

  const relativePackagePath = path.relative(process.cwd(), packagePath);
  console.log(`Closing package: ${relativePackagePath}`);

  const content = fs.readFileSync(packagePath, 'utf8');
  if (/(?:^|\n)(?:-|\d+\.) \[ \]/u.test(content)) {
    console.error(
      `${relativePackagePath} still has open checklist items. ` +
        'Close evidence checklists before running work:close.',
    );
    process.exit(1);
  }

  // R14. Bind the residual count to the evidence artifact before any validation
  // runs, so the closure-phase metricDelta/residual consistency gate sees the
  // measured number rather than an unrecorded field.
  autofillResidualCount(packagePath, relativePackagePath);

  // 1. Run active package validation before the tracker validates the done target.
  console.log('Running active package closure preflight...');
  try {
    execSync(`node scripts/work-tracker.js validate --closure ${relativePackagePath}`, { stdio: 'inherit' });
  } catch (error) {
    console.error('Closure preflight failed. Closure aborted.');
    process.exit(1);
  }

  // 1b. Guard against stale compiled steering packs. steering:check regenerates
  // the packs and fails if the working tree still differs, so a close can never
  // ship doctrine edits without the matching .kiro/steering/llm regeneration.
  console.log('Checking steering pack freshness...');
  try {
    execSync('npm run --silent steering:check', { stdio: 'inherit' });
  } catch (error) {
    console.error(
      'Steering packs are stale. Run `npm run steering:llm:pack`, review the ' +
      'diff, and re-run work:close.',
    );
    process.exit(1);
  }

  // 2. Read package metadata to get commitScope and other details
  const openMarker = '<!-- work-package';
  const closeMarker = '-->';
  const openIndex = content.indexOf(openMarker);
  const closeIndex = content.indexOf(closeMarker, openIndex);
  if (openIndex === -1 || closeIndex === -1) {
    console.error('Error: work-package metadata comment not found in package.');
    process.exit(1);
  }

  const jsonText = content.slice(openIndex + openMarker.length, closeIndex).trim();
  let metadata;
  try {
    metadata = normalizeMetadata(JSON.parse(jsonText), relativePackagePath);
  } catch (error) {
    console.error('Error parsing package metadata JSON:', error.message);
    process.exit(1);
  }

  const activeName = path.basename(packagePath);
  const doneName = activeName.replace(/^active-/, 'done-').replace(/^todo-/, 'done-');
  const targetPath = path.join(path.dirname(packagePath), doneName);
  const relativeTargetPath = path.relative(process.cwd(), targetPath);

  if (dryRun) {
    console.log('\n[DRY RUN] Would execute:');
    console.log(`- Rename ${relativePackagePath} -> ${relativeTargetPath}`);
    console.log('- Bind representativeResidual.residualCount from the evidence artifact (R14)');
    console.log('- Update status to "done" in metadata');
    console.log('- Rewrite all references to the package in the workspace');
    console.log('- Renumber the sprint queue if required');
    console.log('- Stage only commitScope files plus sprint and blocker files');
    if (push) {
      console.log('- Push the close commit and flip package ledgers to Pushed: yes (--push)');
    }
    return;
  }

  // 3. Run the movePackageCommand through work-tracker CLI
  console.log('Executing package close and reference rewriting...');
  try {
    execSync(`node scripts/work-tracker.js close ${relativePackagePath} --write --transaction`, { stdio: 'inherit' });
  } catch (error) {
    console.error('Underlying close command failed.');
    process.exit(1);
  }
  console.log('Done-target validation passed inside work-tracker close.');

  // 4. Find the active sprint file
  const sprintFiles = fs.readdirSync('work/sprints');
  const activeSprintFile = sprintFiles.find((file) => file.startsWith('active-') && file.endsWith('.md'));
  if (!activeSprintFile) {
    console.error('Error: Active sprint file not found.');
    process.exit(1);
  }
  const activeSprintPath = path.join('work/sprints', activeSprintFile);

  // 5. Renumber sprint queue in the sprint file
  console.log(`Renumbering sprint queue in ${activeSprintPath}...`);
  const sprintContent = fs.readFileSync(activeSprintPath, 'utf8');
  const nextSprintContent = renumberSprintQueue(sprintContent);
  fs.writeFileSync(activeSprintPath, nextSprintContent, 'utf8');

  // 5.5. Refresh the current blocker files
  console.log('Refreshing current blocker...');
  try {
    execSync('node scripts/work-tracker.js current-blocker --write', { stdio: 'inherit' });
  } catch (error) {
    console.error('Failed to refresh current blocker:', error.message);
  }

  // 6. Gather files to stage
  const commitScope = metadata.commitScope || [];
  const filesToStage = new Set();

  for (const file of commitScope) {
    const resolvedFile = file.replace(activeName, doneName);
    if (fs.existsSync(resolvedFile)) {
      filesToStage.add(resolvedFile);
    }
  }

  // Always stage the newly closed package file itself
  if (fs.existsSync(relativeTargetPath)) {
    filesToStage.add(relativeTargetPath);
  }

  // Blocker and sprint files
  const blockerJson = 'work/sprints/current-blocker.json';
  const blockerMd = 'work/sprints/current-blocker.md';
  if (fs.existsSync(blockerJson)) filesToStage.add(blockerJson);
  if (fs.existsSync(blockerMd)) filesToStage.add(blockerMd);
  if (fs.existsSync(activeSprintPath)) filesToStage.add(activeSprintPath);

  console.log('\nStaging files...');
  // Reset existing staged files first
  try {
    execSync('git reset', { stdio: 'ignore' });
  } catch (err) {
    // ignore
  }

  for (const file of filesToStage) {
    console.log(`  git add ${file}`);
    execSync(`git add "${file}"`);
  }

  // 7. Auto-commit and update commit ledger if applicable
  console.log('\nCreating focused close commit...');
  try {
    const parentCommitSha = execSync('git rev-parse HEAD', {encoding: 'utf8'}).trim();
    const commitMsg = `close: ${metadata.intent?.title || doneName}`;
    execSync(`git commit -m "${commitMsg}"`, { stdio: 'inherit' });
    
    // Now we are on the new commit. Get its SHA.
    const newCommitSha = execSync('git rev-parse HEAD', {encoding: 'utf8'}).trim();
    
    // Replace parent commit SHA with new commit SHA in the done package file
    if (fs.existsSync(relativeTargetPath)) {
      let fileContent = fs.readFileSync(relativeTargetPath, 'utf8');
      if (fileContent.includes(parentCommitSha)) {
        console.log(`Updating commit ledger in ${relativeTargetPath} with actual commit SHA: ${newCommitSha}`);
        fileContent = fileContent.replace(new RegExp(parentCommitSha, 'g'), newCommitSha);
        fs.writeFileSync(relativeTargetPath, fileContent, 'utf8');
        
        // Re-stage the package file and amend the commit
        execSync(`git add "${relativeTargetPath}"`);
        execSync('git commit --amend --no-edit', { stdio: 'inherit' });
        console.log('Commit ledger successfully hardened!');
      }
    }
  } catch (err) {
    console.error('Failed to create close commit:', err.message);
    process.exit(1);
  }

  console.log('\nPackage successfully closed!');

  if (push) {
    console.log('\nPushing close commit to remote (--push)...');
    const pushStatus = runSprintPush([]);
    if (pushStatus !== 0) {
      console.error(
        'Push failed. The close commit is local; run ' +
        '`npm run work:sprint:push` once the remote is reachable.',
      );
      process.exit(pushStatus);
    }
    console.log('Push complete; package ledgers flipped to Pushed: yes.');
    console.log('\nNext step:');
    console.log('  - Verify/advance the next package:   npm run work:advance -- --check');
    return;
  }

  console.log('\nNext steps:');
  console.log('  1. Push the close commit to remote:   npm run work:sprint:push');
  console.log('     (or re-run work:close with --push to fold push into close)');
  console.log('  2. Verify/advance the next package:   npm run work:advance -- --check');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
