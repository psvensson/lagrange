import {createHash} from 'node:crypto';
import {mkdir, stat, writeFile} from 'node:fs/promises';
import {
  DATA_DIR,
  RATINGS_FALLBACK_URLS,
  RATINGS_FILE,
  RATINGS_SHA256,
  RATINGS_URL,
} from './movie-ranking.js';

async function fileExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

// Every source - canonical or fallback - must deliver the pinned bytes: the
// digest, not the transport, is the integrity boundary. A mirror can only
// substitute the ROUTE, never the content.
function verifyRatingsDigest(buffer, sourceUrl) {
  const digest = createHash('sha256').update(buffer).digest('hex');
  if (digest !== RATINGS_SHA256) {
    throw new Error(
      `Ratings digest mismatch from ${sourceUrl}: ` +
      `expected ${RATINGS_SHA256}, got ${digest}`);
  }
}

async function fetchRatingsBuffer(sourceUrl) {
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to download ratings: ${response.status} ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  verifyRatingsDigest(buffer, sourceUrl);
  return buffer;
}

async function downloadRatings({force = false} = {}) {
  await mkdir(DATA_DIR, {recursive: true});
  if (!force && await fileExists(RATINGS_FILE)) {
    console.log(`Ratings file already exists: ${RATINGS_FILE}`);
    return;
  }

  console.log(`Downloading MovieLens ratings to ${RATINGS_FILE}...`);
  const sources = [RATINGS_URL, ...RATINGS_FALLBACK_URLS];
  const failures = [];
  for (const sourceUrl of sources) {
    let buffer = null;
    try {
      buffer = await fetchRatingsBuffer(sourceUrl);
    } catch (error) {
      // A failed source is a routing fact, not a verdict: report it and try
      // the next digest-verified route (2026-08-29..: the canonical host
      // served an expired certificate for days and CI had no second route).
      failures.push(`${sourceUrl}: ${error.message}`);
      console.warn(`Source failed, trying next: ${sourceUrl} (${error.message})`);
      continue;
    }
    await writeFile(RATINGS_FILE, buffer);
    console.log(`Download complete (${sourceUrl}).`);
    return;
  }
  throw new Error(
    `All ratings sources failed:\n  ${failures.join('\n  ')}`);
}

const force = process.argv.includes('--force');

if (process.argv[1]?.includes('download-movielens.js')) {
  downloadRatings({force}).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export {downloadRatings};
