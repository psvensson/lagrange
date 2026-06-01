#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { execSync } from 'node:child_process';

const MARKDOWN_EXTENSION = '.md';
const SPRINTS_DIRECTORY = 'work/sprints';
const ACTIVE_SPRINT_PATTERN = /^active-.+\.md$/u;

async function findActiveSprint() {
  const entries = await fs.readdir(SPRINTS_DIRECTORY, { withFileTypes: true });
  const activeSprints = entries
    .filter((entry) => entry.isFile() && ACTIVE_SPRINT_PATTERN.test(entry.name))
    .map((entry) => path.join(SPRINTS_DIRECTORY, entry.name))
    .sort();
  if (activeSprints.length === 0) {
    throw new Error('No active sprint file found.');
  }
  return activeSprints[0];
}

async function activatePackage(packageSelector, sprintPath) {
  const activeSprint = sprintPath || await findActiveSprint();
  console.log(`Using active sprint: ${activeSprint}`);

  // Find the package in the queue
  const sprintContent = await fs.readFile(activeSprint, 'utf8');
  
  // Find todo packages matching the selector (e.g. name or slug)
  const todoRegex = /\[([^\]]+)\]\(([^)]*todo-[^)]+\.md)\)/gu;
  let matchedLink = null;
  let matchedName = null;

  for (const match of sprintContent.matchAll(todoRegex)) {
    const name = match[1];
    const link = match[2];
    if (link.includes(packageSelector) || name.toLowerCase().includes(packageSelector.toLowerCase())) {
      matchedLink = link;
      matchedName = name;
      break;
    }
  }

  if (!matchedLink) {
    throw new Error(`No todo package found matching: ${packageSelector}`);
  }

  // Resolve the package path relative to process.cwd()
  const relativeLink = matchedLink.replace(/^\.\.\//u, 'work/');
  const todoPath = path.normalize(relativeLink);
  const activePath = todoPath.replace(/todo-/, 'active-');

  console.log(`Activating package: ${matchedName}`);
  console.log(`  Source: ${todoPath}`);
  console.log(`  Target: ${activePath}`);

  // 1. Check if source exists
  try {
    await fs.access(todoPath);
  } catch {
    throw new Error(`Package file not found at: ${todoPath}`);
  }

  // 2. Read package and update metadata status to "active"
  let packageContent = await fs.readFile(todoPath, 'utf8');
  packageContent = packageContent.replace(/"status":\s*"todo"/u, '"status": "active"');
  await fs.writeFile(todoPath, packageContent, 'utf8');

  // 3. Rename file
  await fs.rename(todoPath, activePath);

  // 4. Update references in the sprint queue
  const nextSprintContent = sprintContent.replace(matchedLink, matchedLink.replace(/todo-/, 'active-'));
  await fs.writeFile(activeSprint, nextSprintContent, 'utf8');

  // 5. Run blocker refresh
  console.log('Refreshing current blocker...');
  execSync('node scripts/work-tracker.js current-blocker --write', { stdio: 'inherit' });

  console.log(`Successfully activated ${matchedName}!`);
}

async function main() {
  const args = process.argv.slice(2);
  const activateIndex = args.indexOf('--activate');
  const sprintIndex = args.indexOf('--sprint');
  const sprintPath = sprintIndex !== -1 ? args[sprintIndex + 1] : null;

  if (activateIndex !== -1 && args[activateIndex + 1]) {
    await activatePackage(args[activateIndex + 1], sprintPath);
  } else {
    console.log('Work Sprint Queue Mutation Tool');
    console.log('Usage: node scripts/work-sprint-queue.js --activate <package-selector> [--sprint <path>]');
  }
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
