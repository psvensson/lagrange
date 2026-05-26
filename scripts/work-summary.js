#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const PACKAGES_DIR = 'work/packages';
const SPRINTS_DIR = 'work/sprints';

async function findActivePackage() {
  try {
    const entries = await fs.readdir(PACKAGES_DIR, { withFileTypes: true });
    const activeFiles = entries
      .filter((entry) => entry.isFile() && entry.name.startsWith('active-') && entry.name.endsWith('.md'))
      .map((entry) => path.join(PACKAGES_DIR, entry.name));
    return activeFiles[0] || null;
  } catch {
    return null;
  }
}

async function findActiveSprint() {
  try {
    const entries = await fs.readdir(SPRINTS_DIR, { withFileTypes: true });
    const sprints = entries
      .filter((entry) => entry.isFile() && entry.name.startsWith('active-') && entry.name.endsWith('.md'))
      .map((entry) => path.join(SPRINTS_DIR, entry.name))
      .sort();
    return sprints[0] || null;
  } catch {
    return null;
  }
}

async function parsePackageInfo(packagePath) {
  if (!packagePath) return null;
  const content = await fs.readFile(packagePath, 'utf8');
  
  // Extract JSON front-matter if present
  const match = content.match(/<!-- work-package\s*([\s\S]*?)\s*-->/u);
  if (match) {
    try {
      const metadata = JSON.parse(match[1]);
      return {
        path: packagePath,
        title: metadata.intent?.title || path.basename(packagePath, '.md'),
        status: metadata.status,
        owner: metadata.intent?.owner || 'unknown',
        boundary: metadata.intent?.boundary || 'unknown',
        nextAction: metadata.intent?.nextAction || 'none',
      };
    } catch {}
  }
  return {
    path: packagePath,
    title: path.basename(packagePath, '.md'),
    status: 'unknown',
    owner: 'unknown',
    boundary: 'unknown',
    nextAction: 'none',
  };
}

async function getSummary(options = {}) {
  const activePackagePath = await findActivePackage();
  const activePackage = await parsePackageInfo(activePackagePath);
  const activeSprint = await findActiveSprint();

  let packagesLeft = 0;
  if (activeSprint) {
    const sprintContent = await fs.readFile(activeSprint, 'utf8');
    const todoMatches = sprintContent.match(/todo-[A-Za-z0-9._-]+\.md/gu) || [];
    packagesLeft = todoMatches.length;
  }

  let nextCommandHint = 'npm run work:package:new';
  if (activePackage) {
    if (activePackage.status === 'active') {
      nextCommandHint = 'npm run work:advance -- --check';
    }
  }

  const data = {
    activePackage,
    activeSprint: activeSprint ? {
      path: activeSprint,
      packagesLeft,
    } : null,
    nextCommandHint,
  };

  if (options.json) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log('\x1b[36m=== Workflow State Summary ===\x1b[0m');
    if (activePackage) {
      console.log(`\x1b[32mActive Package:\x1b[0m ${activePackage.title}`);
      console.log(`  \x1b[90mPath:\x1b[0m ${activePackage.path}`);
      console.log(`  \x1b[90mOwner:\x1b[0m ${activePackage.owner} (${activePackage.boundary})`);
      console.log(`  \x1b[90mNext:\x1b[0m ${activePackage.nextAction}`);
    } else {
      console.log('\x1b[33mNo active package.\x1b[0m');
    }
    if (activeSprint) {
      console.log(`\x1b[32mActive Sprint:\x1b[0m ${path.basename(activeSprint)}`);
      console.log(`  \x1b[90mTodo packages left:\x1b[0m ${packagesLeft}`);
    }
    console.log(`\x1b[35mRecommended Next Command:\x1b[0m ${nextCommandHint}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  await getSummary({ json });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
