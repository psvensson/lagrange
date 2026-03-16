/* eslint-env node */
/* global module */
'use strict';

const TOP_N = 10;

module.exports.run = async function run(ctx, batch) {
  for (const row of batch.rows || []) {
    const movieId = row.movie_id;
    if (movieId === null || movieId === undefined) {
      continue;
    }
    const rating = Number(row.rating) || 0;
    await ctx.emit(String(movieId), rating);
  }

  const reduced = await ctx.call(
    {kind: 'reduceByKey'},
    [],
    async (group) => {
      let sum = 0;
      for (const rating of group.records) {
        sum += Number(rating) || 0;
      }
      const count = group.records.length;
      return {
        movieId: group.key,
        avgRating: count ? sum / count : 0,
        ratingCount: count,
      };
    },
  );

  reduced.sort((a, b) => {
    const diff = b.avgRating - a.avgRating;
    if (diff !== 0) {
      return diff;
    }
    return b.ratingCount - a.ratingCount;
  });

  return reduced.slice(0, TOP_N);
};
