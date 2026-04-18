# Forgejo Integration Module (Fork)

Self-contained renderer UI for the Forgejo (and Gitea) git provider. The
provider logic itself lives in the `@superset/git-provider-forgejo` workspace
package and is wired into the desktop app via the shared `gitProviders` tRPC
router — this module only owns the settings-card UI that talks to that router.

Built for the megaset fork; not part of upstream Superset. Keeping the UI
here (instead of nested under `settings/git/.../components/`) makes upstream
merges trivial — upstream only has a single import line touchpoint.

## Folder layout

```
fork/forgejo-integration/
├── README.md                       ← this file
└── renderer/                       ← React UI
    ├── ForgejoAuthCard.tsx         ← settings card (base URL + PAT entry + connect/disconnect)
    ├── register-settings-sections.tsx ← side-effect import that pushes into the registry
    └── index.ts                    ← barrel
```

## Upstream touchpoints (re-apply after upstream merge)

| File | Insertion | Notes |
|---|---|---|
| `src/renderer/bootstrap-fork-modules.ts` | one-line `import "fork/forgejo-integration/renderer/register-settings-sections";` | already wired |

## Dependencies

The card consumes `electronTrpc.gitProviders.*` (`isConfigured`, `saveToken`,
`clearToken`) — a shared cross-provider tRPC surface. Forgejo is self-hosted,
so the card packs `{url, token}` as JSON into the shared encrypted token slot;
the provider unpacks it on read. The provider implementation itself is in
`packages/git-provider-forgejo`.
