// @ts-nocheck
import {resolve} from 'node:path';

const DATA_DIR = resolve('data/examples/movielens-100k');
const RATINGS_FILE = resolve(DATA_DIR, 'u.data');

const RATINGS_URL =
  'https://files.grouplens.org/datasets/movielens/ml-100k/u.data';

const CREATE_RATINGS_SQL = `
  CREATE TABLE IF NOT EXISTS ratings (
    user_id INTEGER,
    movie_id INTEGER,
    rating INTEGER,
    rating_ts INTEGER
  );
`;

const RATINGS_SELECT_SQL = 'SELECT movie_id, rating FROM ratings';
const TOP_N = 10;

function computeTopMovies(rows) {
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
      movieId: entry.movieId,
      avgRating: entry.count ? entry.sum / entry.count : 0,
      ratingCount: entry.count,
    }))
    .sort((a, b) => {
      const diff = b.avgRating - a.avgRating;
      if (diff !== 0) {
        return diff;
      }
      return b.ratingCount - a.ratingCount;
    })
    .slice(0, TOP_N);
}

export {
  CREATE_RATINGS_SQL,
  DATA_DIR,
  RATINGS_FILE,
  RATINGS_SELECT_SQL,
  RATINGS_URL,
  TOP_N,
  computeTopMovies,
};
