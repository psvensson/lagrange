import {mkdir, stat, writeFile} from 'node:fs/promises';
import {DATA_DIR, RATINGS_FILE, RATINGS_URL} from './movie-ranking.js';

async function fileExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function downloadRatings({force = false} = {}) {
  await mkdir(DATA_DIR, {recursive: true});
  if (!force && await fileExists(RATINGS_FILE)) {
    console.log(`Ratings file already exists: ${RATINGS_FILE}`);
    return;
  }

  console.log(`Downloading MovieLens ratings to ${RATINGS_FILE}...`);
  const response = await fetch(RATINGS_URL);
  if (!response.ok) {
    throw new Error(`Failed to download ratings: ${response.status} ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(RATINGS_FILE, buffer);
  console.log('Download complete.');
}

const force = process.argv.includes('--force');

if (process.argv[1]?.includes('download-movielens.js')) {
  downloadRatings({force}).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export {downloadRatings};
