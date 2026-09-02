import {resolve} from 'node:path';

const DATA_DIR = resolve('data/examples/movielens-100k');
const RATINGS_FILE = resolve(DATA_DIR, 'u.data');

const RATINGS_URL =
  'https://files.grouplens.org/datasets/movielens/ml-100k/u.data';
// Digest-pinned fallback sources, tried in order when the canonical host
// cannot serve (2026-08-29..: files.grouplens.org served an expired leaf
// certificate for days and every CI gate red-lined on the fetch step). The
// wayback snapshot is pinned to an exact timestamp with the id_ modifier so
// it serves the archived original bytes, and the downloader verifies
// RATINGS_SHA256 for EVERY source - the digest, not the transport, is the
// integrity boundary, exactly as the CI dataset step already treats it.
const RATINGS_FALLBACK_URLS = Object.freeze([
  'https://web.archive.org/web/20260606124251id_/' +
    'https://files.grouplens.org/datasets/movielens/ml-100k/u.data',
]);
const RATINGS_SHA256 =
  '06416e597f82b7342361e41163890c81036900f418ad91315590814211dca490';

const CREATE_RATINGS_SQL = `
  CREATE TABLE IF NOT EXISTS ratings (
    user_id INTEGER,
    movie_id INTEGER,
    rating INTEGER,
    rating_ts INTEGER,
    PRIMARY KEY (user_id, movie_id)
  );
`;

const RATINGS_SELECT_SQL = 'SELECT movie_id, rating FROM ratings';
const RATINGS_AGGREGATE_SQL =
  'SELECT movie_id, AVG(rating) AS avg_rating, ' +
  'COUNT(*) AS rating_count FROM ratings GROUP BY movie_id';
const RATINGS_TOP_QUALITY_SQL = `
  WITH grouped AS (
    SELECT
      movie_id,
      AVG(rating) AS avg_rating,
      COUNT(*) AS rating_count,
      SUM(rating) AS rating_sum
    FROM ratings
    GROUP BY movie_id
  )
  SELECT
    movie_id,
    avg_rating,
    rating_count,
    (
      (rating_sum + 87.5) / (rating_count + 25)
      - 0.5 / SQRT(rating_count)
    ) AS score
  FROM grouped
  ORDER BY score DESC, movie_id ASC
  LIMIT 10
`;
const TOP_N = 10;
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

function aggregateRatings(rows) {
  const stats = new Map();
  for (const row of rows) {
    const movieId = row.movie_id;
    if (movieId === null || movieId === undefined) {
      continue;
    }
    const rating = Number(row.rating) || 0;
    const existing = stats.get(movieId) || {movieId, sum: 0, count: 0};
    existing.sum += rating;
    existing.count += 1;
    stats.set(movieId, existing);
  }
  return [...stats.values()]
    .map((entry) => ({
      movie_id: entry.movieId,
      avgRating: entry.count ? entry.sum / entry.count : 0,
      ratingCount: entry.count,
    }));
}

function normalizeAggregateRow(row) {
  const movieId = row.movie_id ?? row.movieId;
  const avgRating = Number(
    row.avg_rating ?? row.avgRating ?? row['AVG(rating)'],
  );
  const ratingCount = Number(
    row.rating_count ?? row.ratingCount ?? row['COUNT(*)'],
  );
  return {
    movieId: Number(movieId),
    avgRating,
    ratingCount,
    score: confidenceAdjustedScore(avgRating, ratingCount),
  };
}

function rankMovieQuality(aggregateRows, limit = TOP_N) {
  return aggregateRows
    .map(normalizeAggregateRow)
    .filter((row) => Number.isFinite(row.movieId) && row.ratingCount > 0)
    .sort((a, b) => {
      const scoreOrder = b.score - a.score;
      if (scoreOrder !== 0) {
        return scoreOrder;
      }
      return a.movieId - b.movieId;
    })
    .slice(0, limit);
}

function computeTopMovies(rows) {
  return rankMovieQuality(aggregateRatings(rows));
}

export {
  CREATE_RATINGS_SQL,
  DATA_DIR,
  RATINGS_FALLBACK_URLS,
  RATINGS_FILE,
  RATINGS_SHA256,
  RATINGS_AGGREGATE_SQL,
  RATINGS_SELECT_SQL,
  RATINGS_TOP_QUALITY_SQL,
  RATINGS_URL,
  QUALITY_RANKING,
  TOP_N,
  aggregateRatings,
  confidenceAdjustedScore,
  computeTopMovies,
  rankMovieQuality,
};
