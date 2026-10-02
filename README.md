# ❯ link

**Make long links less annoying.**

[link.tristian.id](https://link.tristian.id) is a playful, terminal-inspired URL shortener built on top of [Kutt](https://github.com/thedevs-network/kutt) without maintaining a permanent application fork.

The product layer stays deliberately small and replaceable: custom Handlebars views, a Termux Zenburn-inspired responsive theme, shared `tristian.id` favicon assets, and compatibility tests that fail closed when upstream changes something we override.

## Why this exists

- **Kutt stays upstream.** Runtime features, security fixes, migrations, analytics, auth and the API remain Kutt's responsibility.
- **Branding is a read-only layer.** Production materializes this repository's `custom/` tree and mounts it at `/kutt/custom:ro`.
- **Upstream compatibility is tested.** Exact hashes of overridden Kutt templates are checked against every proposed Kutt update.
- **Mobile is first-class.** Narrow layouts, safe areas, 16 px form controls, long URLs and dialogs have explicit regression contracts.
- **The artifact is disposable.** CI publishes a tiny OCI image containing only `/custom` plus compatibility metadata.

## Architecture

```text
thedevs-network/kutt
        │ Renovate
        ▼
 compatibility/compose.yaml
        │
        ├── upstream template hash contract
        └── boot + branding smoke test
                         │
                         ▼
                  nonkronk/tristian-link
                         │
                  publish OCI artifact
                         │
                         ▼
     ghcr.io/nonkronk/tristian-link-theme:main
                         │ Renovate digest
                         ▼
                    nonkronk/oci
                         │ safe GitOps rollout
                         ▼
                  link.tristian.id
```

## Repository layout

```text
custom/                         Kutt-supported customization layer
compatibility/compose.yaml      exact Kutt image tested by CI
compatibility/upstream-contract.json
                                hashes of upstream templates we override
test/theme.sh                   static product contract
test/upstream.sh                upstream compatibility + runtime smoke test
Dockerfile                      scratch OCI artifact; no application fork
.github/workflows/validate.yml  PR compatibility gate
.github/workflows/publish.yml   multi-arch GHCR publication
```

## Update workflow

Renovate proposes Kutt updates here first. Patch and digest updates may auto-merge only after compatibility CI passes. Minor updates remain human-reviewed; majors also require Dependency Dashboard approval.

A successful merge republishes `tristian-link-theme:main`. Production pins that artifact by digest alongside the exact Kutt image, so `link.tristian.id` only advances after the product layer and upstream image are proven compatible.

If an overridden upstream template changes, CI stops with the affected path and expected/actual Git blob hashes. The override must be reviewed intentionally rather than silently drifting.

## Local validation

```bash
bash test/theme.sh
bash test/upstream.sh
```

`test/upstream.sh` pulls the exact Kutt image from `compatibility/compose.yaml`, mounts `custom/` read-only, boots Kutt, and verifies that the branded runtime actually renders.

## Design language

The interface borrows from the official Termux Zenburn palette and Powerlevel10k-style prompt vocabulary without turning normal interactions into a fake terminal. A non-technical visitor still gets the familiar flow: paste URL → shorten → copy.

The favicon set is copied byte-for-byte from [nonkronk/tristian-id](https://github.com/nonkronk/tristian-id), keeping the site family visually consistent.

## License

MIT. See [LICENSE](LICENSE) and [NOTICE](NOTICE). Kutt is an independent upstream project and is also MIT licensed.
