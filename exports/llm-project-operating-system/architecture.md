# Architecture

This file is the root architecture index for the project.

Use it to define:

1. Durable semantic owners.
2. Canonical read and write ingress paths.
3. Shared state vocabularies and decision contracts.
4. Boundary diagrams or links to detailed subsystem notes.
5. Consumers allowed to observe or mutate each shared contract.
6. Forbidden reinterpretations and deprecated paths.

Keep this file current when a package changes a shared boundary. If detailed
architecture records are needed, place them under `architecture/` and link them
from this root index.
