# MovieLens Access-Affinity (reduceByKey)

This example demonstrates **access-affinity** by executing the core aggregation
loop directly on the nodes that hold the data. Instead of pulling every row
back to the client, each partition emits `(movie_id, rating)` pairs and the
runtime reduces them with `reduceByKey` before returning the final top-10 list.

## Callback flow

1. **Partition callback** iterates `ratings` rows locally and emits
   `(movie_id, rating)` pairs via `ctx.emit`.
2. **reduceByKey** groups by movie id and computes `avgRating` and
   `ratingCount` for each movie.
3. The callback sorts by `avgRating` (desc), breaking ties by count.
4. The top 10 rows are returned to the client.

The callback implementation lives in `index.js`:

```js
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

  return reduced.slice(0, 10);
};
```

## Dataset + query

- Dataset: MovieLens 100k (`data/examples/movielens-100k/u.data`)
- Query: `SELECT movie_id, rating FROM ratings`

The dataset is loaded through the scripts in `examples/movielens-access-affinity/`.

## Baseline vs Lagrange comparison

Use the orchestration script to compare a **3-node Postgres baseline** against
the **Lagrange distributed callback**:

```bash
node examples/movielens-access-affinity/run-comparison.js
```

### Sample metrics

_Run the comparison script once and paste the JSON output here._

```json
{
  "baseline": {
    "totalRows": 0,
    "loadDurationMs": 0,
    "queryDurationMs": 0,
    "replicationFactor": 3
  },
  "lagrange": {
    "totalRows": 0,
    "loadDurationMs": 0,
    "callbackDurationMs": 0,
    "target": "ws://127.0.0.1:8081/api/admin/stream"
  },
  "comparison": {
    "baselineQueryMs": 0,
    "lagrangeCallbackMs": 0,
    "speedup": null
  }
}
```