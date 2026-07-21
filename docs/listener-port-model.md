# Listener port model

Lagrange nodes expose three distinct listener ports from one configuration
model:

| Listener | Configuration key | Environment variable | Default |
| --- | --- | --- | --- |
| REST API | `node.restApiPort` | `REST_API_PORT` | `8080` |
| Admin WebSocket | `admin.websocketPort` | `ADMIN_WS_PORT` | REST + 1 |
| Transport WebSocket | `node.wsPort` | `TRANSPORT_WS_PORT` | REST + 2 |

Deprecated names remain accepted while their canonical replacement is unset,
with a startup deprecation warning: `ADMIN_WEBSOCKET_PORT` (now
`ADMIN_WS_PORT`), `ADMIN_WEBSOCKET_HOST` (now `ADMIN_WS_HOST`), and
`NODE_WS_PORT` (now `TRANSPORT_WS_PORT`). The canonical name wins when both
are set.

Changing only the REST port moves both WebSocket defaults. Either WebSocket
port can be overridden independently; an explicit override is validated
without evaluating the unused derived value. This permits a REST port near the
top of the valid range when both WebSocket ports are explicitly set.

All resolved ports must be distinct integers from 1 through 65535. Startup
rejects invalid, overflowing, or colliding values. JavaScript runtime address
derivation, entrypoint help, the admin CLI, and helper scripts consume the
canonical listener-port module. The Helm chart mirrors that contract through
one centralized family of template helpers instead of spreading offset logic
across its workloads and Services.

For Helm deployments, `node.restPort` is the base value and
`admin.websocketPort` / `node.wsPort` are optional overrides. Render-time
validation remains fail closed when schema validation is skipped: non-integer,
out-of-range, and colliding values are rejected. The chart publishes REST and
transport ports, while the unauthenticated admin listener stays pod-local on
loopback and is not exposed by a Service or container-port declaration.
