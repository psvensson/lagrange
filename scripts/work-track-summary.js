#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const TRACKS_DIR = 'work/tracks';
const RELEASES_DIR = 'work/releases';

async function parseMarkdownTrack(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  const lines = content.split('\n');
  let title = path.basename(filePath, '.md');
  
  if (lines[0] && lines[0].startsWith('# ')) {
    title = lines[0].slice(2).trim();
  }

  // Count total and checked boxes
  const totalCheckboxes = (content.match(/- \[[ xX]\]/gu) || []).length;
  const checkedCheckboxes = (content.match(/- \[[xX]\]/gu) || []).length;

  return {
    path: filePath,
    title,
    totalCheckboxes,
    checkedCheckboxes,
    completionPercentage: totalCheckboxes > 0 ? Math.round((checkedCheckboxes / totalCheckboxes) * 100) : 100,
  };
}

async function getTrackAndReleaseSummary(options = {}) {
  const tracks = [];
  const releases = [];

  try {
    const trackEntries = await fs.readdir(TRACKS_DIR, { withFileTypes: true });
    for (const entry of trackEntries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        const info = await parseMarkdownTrack(path.join(TRACKS_DIR, entry.name));
        tracks.push(info);
      }
    }
  } catch {}

  try {
    const releaseEntries = await fs.readdir(RELEASES_DIR, { withFileTypes: true });
    for (const entry of releaseEntries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        const info = await parseMarkdownTrack(path.join(RELEASES_DIR, entry.name));
        releases.push(info);
      }
    }
  } catch {}

  const data = {
    tracks,
    releases,
  };

  if (options.json) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log('\x1b[36m=== Tracks and Releases Summary ===\x1b[0m');
    console.log('\n\x1b[35m[Tracks]\x1b[0m');
    for (const track of tracks) {
      console.log(`- \x1b[32m${track.title}\x1b[0m (${path.basename(track.path)})`);
      console.log(`  Progress: ${track.checkedCheckboxes}/${track.totalCheckboxes} tasks (${track.completionPercentage}%)`);
    }

    console.log('\n\x1b[35m[Releases]\x1b[0m');
    for (const rel of releases) {
      console.log(`- \x1b[32m${rel.title}\x1b[0m (${path.basename(rel.path)})`);
      console.log(`  Progress: ${rel.checkedCheckboxes}/${rel.totalCheckboxes} tasks (${rel.completionPercentage}%)`);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  await getTrackAndReleaseSummary({ json });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
