# system-endpoint-sync-controller Chart

Sample chart for deploying a Kubernetes-side endpoint sync controller.

## Runtime Entrypoint

The container image should start:

```bash
node scripts/start-endpoint-sync-controller.js
```

This script reads endpoint-sync env vars plus in-cluster service account
credentials for Kubernetes API access.

If your image does not define this as default entrypoint, set:

- `controller.command[0]=node`
- `controller.command[1]=scripts/start-endpoint-sync-controller.js`

## Required Values

- `source.adminStreamUrl`

## Optional Secret

If the source admin API requires a token, create a secret and point chart values
at it:

```bash
kubectl -n endpoint-sync create secret generic endpoint-sync-auth \
  --from-literal=token='<token>'
```

Then set:

- `source.auth.existingSecret.name=endpoint-sync-auth`
- `source.auth.existingSecret.tokenKey=token`
