# Start Here

There are three useful entry points:

1. **Decide whether the product fits:** read
   [Evaluating Lagrange](evaluate.md).
2. **Run the current public service path:** follow the
   [first-hour tutorial](tutorials/first-hour.md).
3. **Understand the distributed system:** open the
   [architecture index](../architecture/INDEX.md).

The complete task-based map is [Documentation](README.md).

Before planning a pilot, also read:

- [Current capabilities and limitations](current-capabilities-and-limitations.md)
- [Migration and adoption](migration.md)
- [Security](security.md)
- [Operations readiness](operations-readiness.md)

Lagrange includes its own partitioned SQL storage. It is not a PostgreSQL
extension. PostgreSQL-wire compatibility can reduce application changes, but
services execute data-locally only against data stored in Lagrange.
