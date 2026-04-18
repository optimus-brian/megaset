# GitHub Integration Module (Fork)

Self-contained renderer UI for the GitHub git provider. The provider logic
itself lives in the `@superset/git-provider-github` workspace package and is
wired into the desktop app via the shared `gitProviders` tRPC router — this
module only owns the settings-card UI that talks to that router.

Built for the megaset fork; not part of upstream Superset. Keeping the UI
here (instead of nested under `settings/git/.../components/`) makes upstream
merges trivial — upstream only has a single import line touchpoint.

## Folder layout

```
fork/github-integration/
├── README.md                      ← this file
└── renderer/                      ← React UI
    ├── GitHubAuthCard.tsx         ← settings card (PAT entry + connect/disconnect)
    └── index.ts                   ← barrel
```

## Upstream touchpoints (re-apply after upstream merge)

| File | Insertion | Notes |
|---|---|---|
| `src/renderer/routes/_authenticated/settings/git/components/GitProvidersSection/GitProvidersSection.tsx` | `import { GitHubAuthCard } from "fork/github-integration/renderer";` + `<GitHubAuthCard />` line | 2 lines. |

## Dependencies

The card consumes `electronTrpc.gitProviders.*` (`isConfigured`, `saveToken`,
`clearToken`) — a shared cross-provider tRPC surface, not GitHub-specific.
The provider implementation itself is in `packages/git-provider-github`.
