import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  RATINGS_EXPECTED_DIGEST,
} from './movielens-public-request-workload-dataset.js';
import {
  MOVIELENS_PUBLIC_REQUEST,
} from './movielens-public-request-workload-contract.js';
import {RATINGS_FILE} from './movie-ranking.js';

const DATASET_SIZES = Object.freeze([10_000, 100_000]);
const SKEWS = Object.freeze(['observed', 'movie_hotspot_80_20']);
const HOTSPOT_RATIO = 0.8;
const HOT_MOVIE_MAX = 410;
const SYNTHETIC_USER_OFFSET = 1_000_000;
const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';
const SHA256_PREFIX = 'sha256:';
const HEX_RADIX = 16;
const HEX_WIDTH = 2;
const HEX_ZERO = '0';
const RATING_TIMESTAMP_FIELD_INDEX = 3;
const EXCLUSIVE_CREATE = 'wx';
const FIELD_DELIMITER = '\t';
const LINE_PATTERN = /\r?\n/u;
const ADJACENT_WAT_DATA_STRINGS = /"\r?\n\s*"/gu;
const SOURCE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const COMPONENT_SOURCE_PATH = path.join(
  SOURCE_DIRECTORY,
  MOVIELENS_PUBLIC_REQUEST.COMPONENT_SOURCE_FILE,
);
const arrayJoin = Function.call.bind(Array.prototype.join);
const arrayPush = Function.call.bind(Array.prototype.push);
const mathFloor = Math.floor;
const stringIndexOf = Function.call.bind(String.prototype.indexOf);
const stringReplace = Function.call.bind(String.prototype.replace);
const stringSplit = Function.call.bind(String.prototype.split);
const localText = Object.freeze({
  COMPONENT_DIGEST_MARKER:
    'MovieLens component must contain one canonical dataset digest marker',
  HOTSPOT_POOLS_EMPTY: 'MovieLens hotspot pools must both be non-empty',
  SOURCE_CARDINALITY:
    'MovieLens 100K source cardinality mismatch',
  VARIANT_ABSENT:
    'MovieLens grouped-reduce dataset variant is absent',
});

function sha256(bytes) {
  return `${SHA256_PREFIX}${
    createHash(HASH_ALGORITHM).update(bytes).digest(HASH_ENCODING)
  }`;
}

function sourceRows(text) {
  const rows = [];
  const lines = stringSplit(text, LINE_PATTERN);
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].length > 0) arrayPush(rows, lines[index]);
  }
  if (rows.length !== DATASET_SIZES[1]) {
    throw new Error(localText.SOURCE_CARDINALITY);
  }
  return rows;
}

function hotspotPools(rows) {
  const hot = [];
  const cold = [];
  for (let index = 0; index < rows.length; index += 1) {
    const fields = stringSplit(rows[index], FIELD_DELIMITER);
    const movieId = Number(fields[1]);
    arrayPush(movieId <= HOT_MOVIE_MAX ? hot : cold, fields);
  }
  if (hot.length === 0 || cold.length === 0) {
    throw new Error(localText.HOTSPOT_POOLS_EMPTY);
  }
  return {hot, cold};
}

function observedRows(rows, size) {
  const selected = [];
  for (let index = 0; index < size; index += 1) {
    arrayPush(selected, rows[index]);
  }
  return selected;
}

function syntheticRow(fields, outputIndex) {
  return arrayJoin([
    `${SYNTHETIC_USER_OFFSET + outputIndex}`,
    fields[1],
    fields[2],
    fields[RATING_TIMESTAMP_FIELD_INDEX],
  ], FIELD_DELIMITER);
}

function hotspotRows(pools, size) {
  const selected = [];
  const hotCount = mathFloor(size * HOTSPOT_RATIO);
  for (let index = 0; index < size; index += 1) {
    const inHotSet = index < hotCount;
    const pool = inHotSet ? pools.hot : pools.cold;
    const poolIndex = inHotSet ? index : index - hotCount;
    arrayPush(
      selected,
      syntheticRow(pool[poolIndex % pool.length], index),
    );
  }
  return selected;
}

function variantRows(rows, pools, size, skew) {
  return skew === SKEWS[0] ?
    observedRows(rows, size) :
    hotspotRows(pools, size);
}

function escapedWatAscii(value) {
  let escaped = '';
  for (let index = 0; index < value.length; index += 1) {
    escaped += `\\${value.charCodeAt(index)
      .toString(HEX_RADIX)
      .padStart(HEX_WIDTH, HEX_ZERO)}`;
  }
  return escaped;
}

function variantComponentSource(source, datasetDigest) {
  const normalized =
    stringReplace(source, ADJACENT_WAT_DATA_STRINGS, '');
  const canonical = escapedWatAscii(RATINGS_EXPECTED_DIGEST);
  if (
    stringIndexOf(normalized, canonical) === -1 ||
    stringIndexOf(
      normalized,
      canonical,
      stringIndexOf(normalized, canonical) + canonical.length,
    ) !== -1
  ) {
    throw new Error(
      localText.COMPONENT_DIGEST_MARKER,
    );
  }
  return stringReplace(normalized, canonical, escapedWatAscii(datasetDigest));
}

export async function createMovielensGroupedReduceMatrixDatasets(directory) {
  const sourceBytes = await readFile(RATINGS_FILE);
  const componentSource =
    (await readFile(COMPONENT_SOURCE_PATH)).toString('utf8');
  const rows = sourceRows(sourceBytes.toString('utf8'));
  const pools = hotspotPools(rows);
  const variants = [];
  for (let sizeIndex = 0; sizeIndex < DATASET_SIZES.length; sizeIndex += 1) {
    const cardinality = DATASET_SIZES[sizeIndex];
    for (let skewIndex = 0; skewIndex < SKEWS.length; skewIndex += 1) {
      const skew = SKEWS[skewIndex];
      const selected = variantRows(rows, pools, cardinality, skew);
      const bytes = Buffer.from(`${arrayJoin(selected, '\n')}\n`, 'utf8');
      const filePath = path.join(
        directory,
        `movielens-${cardinality}-${skew}.data`,
      );
      await writeFile(filePath, bytes, {flag: EXCLUSIVE_CREATE});
      const digest = sha256(bytes);
      const componentSourceBytes = Buffer.from(
        variantComponentSource(componentSource, digest),
        'utf8',
      );
      const componentSourcePath = path.join(
        directory,
        `movielens-component-${digest.slice(SHA256_PREFIX.length)}.wat`,
      );
      await writeFile(
        componentSourcePath,
        componentSourceBytes,
        {flag: EXCLUSIVE_CREATE},
      );
      arrayPush(variants, Object.freeze({
        bytes,
        cardinality,
        componentSourceBytes,
        componentSourceDigest: sha256(componentSourceBytes),
        componentSourcePath,
        digest,
        path: filePath,
        skew,
        source:
          `MovieLens 100K deterministic ${cardinality}/${skew} variant`,
      }));
    }
  }
  return Object.freeze(variants);
}

export function selectMovielensGroupedReduceMatrixDataset(
  variants,
  cardinality,
  skew,
) {
  for (let index = 0; index < variants.length; index += 1) {
    if (
      variants[index].cardinality === cardinality &&
      variants[index].skew === skew
    ) {
      return variants[index];
    }
  }
  throw new Error(localText.VARIANT_ABSENT);
}
