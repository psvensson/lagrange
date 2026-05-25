import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

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

  // 1. Run active package validation before the tracker validates the done target.
  console.log('Running active package closure preflight...');
  try {
    execSync(`node scripts/work-tracker.js validate --closure ${relativePackagePath}`, { stdio: 'inherit' });
  } catch (error) {
    console.error('Closure preflight failed. Closure aborted.');
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
    metadata = JSON.parse(jsonText);
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
    console.log('- Update status to "done" in metadata');
    console.log('- Rewrite all references to the package in the workspace');
    console.log('- Renumber the sprint queue if required');
    console.log('- Stage only commitScope files plus sprint and blocker files');
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

  // 6. Gather files to stage
  const commitScope = metadata.scope && metadata.scope.commitScope || [];
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

  console.log('Package successfully closed!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
