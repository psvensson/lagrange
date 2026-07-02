# MovieLens Access-Affinity Demo

This demo compares a **classic compute pattern** (fetch rows into the app and
aggregate locally) using a **3-node Postgres baseline** with **Lagrange’s
partition-callback execution**, where the core loop runs alongside the data and
only aggregated results return.

Dataset: [MovieLens 100k](https://files.grouplens.org/datasets/movielens/ml-100k/)

## Prerequisites

- **Docker** — the Postgres baseline (steps 2 and 4) starts containers and
  pulls `postgres:16`; the daemon must be running.
- **Internet access** — step 1 downloads the dataset from
  `files.grouplens.org`.
- Node.js >= 22 and `npm install` done in the repo root.

## 1) Download the dataset

```bash
node examples/movielens-access-affinity/download-movielens.js
```

The dataset is stored under `data/examples/movielens-100k/`.

## 2) Postgres baseline (3-node cluster)

```bash
node examples/movielens-access-affinity/run-postgres-baseline.js
```

This script spins up a 3-node Postgres cluster (1 primary + 2 replicas), loads
the ratings into the primary, and then:

- Fetches all `(movie_id, rating)` rows into Node
- Computes the top-10 movies by average rating in-process
- Reports load + query durations for baseline comparison

## 3) Lagrange compute (partition callback + reduceByKey)

```bash
node examples/movielens-access-affinity/run-lagrange-demo.js
```

This script:

1. Starts a local seed node (unless `--no-start` is passed)
2. Loads the same ratings dataset into Lagrange
3. Runs the `07-movielens-access-affinity` callback example, which:
   - Executes the loop over rows inside partition callbacks
   - Reduces results by movie id and returns only the top-10 summary

The script prints structured metrics for the load + callback phases.

## 4) Baseline vs Lagrange comparison

```bash
node examples/movielens-access-affinity/run-comparison.js
```

This helper runs the Postgres baseline first, then the Lagrange demo, and
prints a JSON payload with the baseline metrics, Lagrange metrics, and a
speedup ratio.

### Running against an already-running node

Start the node in another terminal:

```bash
bash scripts/start-seed-node.sh
```

Then run:

```bash
node examples/movielens-access-affinity/run-lagrange-demo.js --no-start
```

### Notes

- The callback example lives in `examples/distributed-sql/07-movielens-access-affinity`.
- The Lagrange run uses the same `(movie_id, rating)` select as the classic run,
  but performs the core loop at the data location instead of pulling all rows
  back to the client.