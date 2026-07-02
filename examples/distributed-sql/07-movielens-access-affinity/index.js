/* eslint-env node */
/* global module */
'use strict';

const TOP_N = 10;

module.exports.run = async function run(ctx, batch) {
  // Combiner: pre-aggregate per movie inside the row loop so only one
  // partial {sum, count} record per movie is emitted, instead of one
  // record per rating (which exceeds the emit byte budget on 100k rows).
  const partials = new Map();
  for (const row of batch.rows || []) {
    const movieId = row.movie_id;
    if (movieId === null || movieId === undefined) {
      continue;
    }
    const rating = Number(row.rating) || 0;
    const key = String(movieId);
    const partial = partials.get(key) || {sum: 0, count: 0};
    partial.sum += rating;
    partial.count += 1;
    partials.set(key, partial);
  }

  for (const [key, partial] of partials) {
    await ctx.emit(key, partial);
  }

  const reduced = await ctx.call(
    {kind: 'reduceByKey'},
    [],
    async (group) => {
      let sum = 0;
      let count = 0;
      for (const partial of group.records) {
        sum += Number(partial?.sum) || 0;
        count += Number(partial?.count) || 0;
      }
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
