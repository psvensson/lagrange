import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

import {
  RATINGS_FILE,
  computeTopMovies,
} from './movie-ranking.js';
import {
  MOVIELENS_PUBLIC_REQUEST_MAX_MOVIE_ID,
} from './movielens-public-request-workload-contract.js';

const BYTE_ENCODING = 'utf8';
const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';
const RATING_VALUE_BITS = 3;
const RATING_VALUE_MASK = 7;
const RATINGS_SOURCE = 'MovieLens 100K u.data';
const RATINGS_EXPECTED_CARDINALITY = 100_000;
const RATINGS_EXPECTED_DIGEST =
  'sha256:06416e597f82b7342361e41163890c81036900f418ad91315590814211dca490';
const RATINGS_MAX_BYTES = 4 * 1_024 * 1_024;
const FIELD_DELIMITER = '\t';
const LINE_DELIMITER = /\r?\n/u;

function packMovieRating(movieId, rating) {
  if (
    !Number.isSafeInteger(movieId) ||
    Object.is(movieId, -0) ||
    movieId <= 0 ||
    movieId > MOVIELENS_PUBLIC_REQUEST_MAX_MOVIE_ID
  ) {
    throw new TypeError(`unsupported MovieLens movie id: ${movieId}`);
  }
  if (!Number.isSafeInteger(rating) || Object.is(rating, -0) || rating <= 0 ||
      rating > RATING_VALUE_MASK) {
    throw new TypeError(`unsupported MovieLens rating: ${rating}`);
  }
  return (movieId << RATING_VALUE_BITS) | rating;
}

function unpackMovieRating(value) {
  return {
    movieId: value >> RATING_VALUE_BITS,
    rating: value & RATING_VALUE_MASK,
  };
}

function parseRatingsText(text) {
  if (typeof text !== 'string' || text.length === 0) {
    throw new TypeError('MovieLens ratings text is required');
  }
  const ratings = [];
  const packedRows = [];
  const lines = text.split(LINE_DELIMITER);
  for (const line of lines) {
    if (!line) continue;
    const fields = line.split(FIELD_DELIMITER);
    if (fields.length !== 4) {
      throw new TypeError('MovieLens rating row must have four fields');
    }
    const userId = Number(fields[0]);
    const movieId = Number(fields[1]);
    const rating = Number(fields[2]);
    const timestamp = Number(fields[3]);
    if (
      !Number.isSafeInteger(userId) ||
      Object.is(userId, -0) ||
      !Number.isSafeInteger(timestamp) ||
      Object.is(timestamp, -0)
    ) {
      throw new TypeError('MovieLens user and timestamp must be integers');
    }
    const value = packMovieRating(movieId, rating);
    const key = ratings.length + 1;
    ratings.push({
      movie_id: movieId,
      rating,
      rating_ts: timestamp,
      user_id: userId,
    });
    packedRows.push({key, value});
  }
  if (ratings.length === 0) {
    throw new TypeError('MovieLens dataset must not be empty');
  }
  return {
    cardinality: ratings.length,
    expectedTopMovies: computeTopMovies(ratings),
    packedRows,
    ratings,
  };
}

async function loadDataset(ratingsPath, identity) {
  const bytes = await readFile(ratingsPath);
  if (bytes.length > RATINGS_MAX_BYTES) {
    throw new RangeError('MovieLens dataset byte cap exceeded');
  }
  const digest = `sha256:${createHash(HASH_ALGORITHM)
    .update(bytes)
    .digest(HASH_ENCODING)}`;
  if (digest !== identity.digest) {
    throw new Error(`MovieLens dataset identity mismatch: ${digest}`);
  }
  const parsed = parseRatingsText(bytes.toString(BYTE_ENCODING));
  if (parsed.cardinality !== identity.cardinality) {
    throw new Error(
      `MovieLens dataset identity mismatch: ${digest} ` +
      `rows=${parsed.cardinality}`,
    );
  }
  return Object.freeze({
    ...parsed,
    bytes,
    digest,
    sizeBytes: bytes.length,
    source: identity.source,
  });
}

async function loadMovielensPublicRequestDataset(
  ratingsPath = RATINGS_FILE,
) {
  return loadDataset(ratingsPath, {
    cardinality: RATINGS_EXPECTED_CARDINALITY,
    digest: RATINGS_EXPECTED_DIGEST,
    source: RATINGS_SOURCE,
  });
}

async function loadMovielensPublicRequestDatasetVariant(
  ratingsPath,
  identity,
) {
  if (
    !identity ||
    !Number.isSafeInteger(identity.cardinality) ||
    identity.cardinality <= 0 ||
    typeof identity.digest !== 'string' ||
    typeof identity.source !== 'string' ||
    identity.source.length === 0
  ) {
    throw new TypeError('explicit MovieLens variant identity is required');
  }
  return loadDataset(ratingsPath, identity);
}

export {
  RATING_VALUE_BITS,
  RATING_VALUE_MASK,
  RATINGS_EXPECTED_CARDINALITY,
  RATINGS_EXPECTED_DIGEST,
  RATINGS_MAX_BYTES,
  RATINGS_SOURCE,
  loadMovielensPublicRequestDataset,
  loadMovielensPublicRequestDatasetVariant,
  packMovieRating,
  parseRatingsText,
  unpackMovieRating,
};
