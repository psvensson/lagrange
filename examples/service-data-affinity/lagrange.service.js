/**
 * Public WASI call-Binding service for the MovieLens service-data affinity demo.
 *
 * Each partition-local shard reads grouped movie aggregates from its local
 * ratings partition, computes confidence-adjusted Bayesian scores for interior
 * movies, and emits bounded partial candidates (top-10 interior scores plus
 * boundary movie sum/count pairs) so reduce produces the exact global top-10.
 */

import {defineService} from '../../src/authoring/define-service.js';
import {distributed} from '../../src/authoring/distributed-operation.js';
import {sql} from '../../src/authoring/sql-template.js';

const SERVICE_NAME = 'movielens';
const SERVICE_VERSION = '1.0.0';
const TOP_N = 10;
const PARTIAL_KIND_SCORE = 'score';
const PARTIAL_KIND_BOUNDARY = 'boundary';
const BOUNDARY_COUNT_STRIDE = 1_000_000;
const QUALITY_RANKING = Object.freeze({
  priorMean: 3.5,
  priorWeight: 25,
  confidencePenalty: 0.5,
});

function confidenceAdjustedScore(avgRating, ratingCount, options = {}) {
  const config = {...QUALITY_RANKING, ...options};
  const count = Number(ratingCount);
  const average = Number(avgRating);
  if (!Number.isFinite(average) || !Number.isFinite(count) || count <= 0) {
    return 0;
  }
  const bayesianMean =
    (average * count + config.priorMean * config.priorWeight) /
    (count + config.priorWeight);
  return bayesianMean - config.confidencePenalty / Math.sqrt(count);
}

function parseNumericMetric(rawValue) {
  const parsed = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
  const numeric = Number(parsed);
  return Number.isFinite(numeric) ? numeric : 0;
}

function topnRun(rows, _args, {emit}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return {emitted: 0};
  }
  const minMovieId = Number(rows[0]?.movie_id);
  const maxMovieId = Number(rows[rows.length - 1]?.movie_id);
  const shardTag = `${minMovieId}_${maxMovieId}_${rows.length}`;
  const interiorCandidates = [];
  let emitted = 0;

  for (const row of rows) {
    const movieId = Number(row?.movie_id);
    const ratingSum = Number(row?.rating_sum);
    const ratingCount = Number(row?.rating_count);
    if (!Number.isFinite(movieId) || !Number.isFinite(ratingSum) ||
        !Number.isFinite(ratingCount) || ratingCount <= 0) {
      continue;
    }
    if (movieId === minMovieId || movieId === maxMovieId) {
      emit(
        `${PARTIAL_KIND_BOUNDARY}:${movieId}:${shardTag}`,
        ratingCount * BOUNDARY_COUNT_STRIDE + ratingSum,
      );
      emitted += 1;
      continue;
    }
    const averageRating = ratingSum / ratingCount;
    const score = confidenceAdjustedScore(
      averageRating,
      ratingCount,
      QUALITY_RANKING,
    );
    interiorCandidates.push({movieId, score});
  }

  const interiorLimit = Math.max(0, TOP_N - emitted);
  interiorCandidates.sort((left, right) =>
    (right.score - left.score) || (left.movieId - right.movieId));
  for (const candidate of interiorCandidates.slice(0, interiorLimit)) {
    emit(
      `${PARTIAL_KIND_SCORE}:${candidate.movieId}:${shardTag}`,
      candidate.score,
    );
    emitted += 1;
  }
  return {emitted};
}

function topnReduce(partials) {
  const scoresByMovieId = new Map();
  const boundaryByMovieId = new Map();

  for (const [key, rawValue] of partials || []) {
    const [kind, movieIdText] = String(key).split(':');
    const movieId = Number(movieIdText);
    if (!Number.isFinite(movieId)) {
      continue;
    }
    const value = parseNumericMetric(rawValue);
    if (kind === PARTIAL_KIND_SCORE) {
      scoresByMovieId.set(movieId, value);
      continue;
    }
    if (kind === PARTIAL_KIND_BOUNDARY) {
      const count = Math.floor(value / BOUNDARY_COUNT_STRIDE);
      const sum = value - count * BOUNDARY_COUNT_STRIDE;
      const entry = boundaryByMovieId.get(movieId) || {sum: 0, count: 0};
      entry.sum += sum;
      entry.count += count;
      boundaryByMovieId.set(movieId, entry);
    }
  }

  for (const [movieId, {sum, count}] of boundaryByMovieId.entries()) {
    if (count > 0) {
      scoresByMovieId.set(
        movieId,
        confidenceAdjustedScore(sum / count, count, QUALITY_RANKING),
      );
    }
  }

  return Array.from(scoresByMovieId.entries())
    .map(([movieId, score]) => ({
      movie_id: movieId,
      score,
    }))
    .sort((left, right) =>
      (right.score - left.score) || (left.movie_id - right.movie_id))
    .slice(0, TOP_N);
}

const topn = distributed({
  reduce: topnReduce,
  run: topnRun,
  statement: sql`SELECT movie_id, SUM(rating) AS rating_sum, COUNT(*) AS rating_count FROM ratings GROUP BY movie_id ORDER BY movie_id ASC`,
});

export {topnReduce, topnRun};

export default defineService({
  handlers: {},
  name: SERVICE_NAME,
  operations: {
    topn,
  },
  version: SERVICE_VERSION,
});
