---
source: operator-directive#read-precomputed-artifacts
---

Before re-deriving an expensive analysis by hand, you MUST first sort the candidate artifacts by modification time and read the freshest precomputed result, reusing a costly scan already on disk rather than re-running it for a different slice.
