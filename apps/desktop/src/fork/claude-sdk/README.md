# Claude SDK Module (Fork)

Self-contained integration of `@anthropic-ai/claude-agent-sdk` as an in-app
chat tab. Built for the megaset fork; not part of upstream Superset.

The whole module lives in this folder. **Upstream files only have
small "registration" insertions** (1–3 lines each), making upstream merges
trivial — re-apply the touchpoints from the table below if a merge wipes them.

## Folder layout

```
fork/claude-sdk/
├── README.md                      ← this file
├── main/                          ← Electron main process
│   ├── types.ts                   ← RuntimeEvent, UsageSnapshot, …
│   ├── session.ts                 ← ClaudeSdkSession (wraps SDK query())
│   └── manager.ts                 ← session map, getClaudeSdkManager()
├── trpc/                          ← IPC layer (observables for streaming)
│   ├── router.ts                  ← createClaudeSdkRouter
│   └── index.ts                   ← barrel
├── settings-store/                ← persisted UI settings (zustand)
│   ├── store.ts                   ← useClaudeSdkSettingsStore
│   └── index.ts                   ← barrel
└── renderer/                      ← React UI
    ├── ClaudeSdkPane.tsx          ← chat pane (rendered by tab system)
    ├── ClaudeSdkAgentCard.tsx     ← settings card
    └── tab-integration.ts         ← createClaudeSdkTabWithPane helper
```

## Upstream touchpoints (re-apply after upstream merge)

| File | Insertion | Notes |
|---|---|---|
| `src/shared/tabs-types.ts` | `\| "claude-sdk"` in `PaneType` union | Cannot be moved — TS unions can't be extended externally. |
| `src/lib/trpc/routers/index.ts` | `import { createClaudeSdkRouter } from "fork/claude-sdk/trpc";` + `claudeSdk: createClaudeSdkRouter(),` line in router | 2 lines. |
| `src/renderer/stores/tabs/types.ts` | `addClaudeSdkTab: (workspaceId) => { tabId; paneId };` in `TabsStore` interface | 3 lines. |
| `src/renderer/stores/tabs/store.ts` | `import { createAddClaudeSdkTabAction } from "fork/claude-sdk/renderer/tab-integration";` + `addClaudeSdkTab: createAddClaudeSdkTabAction(set, get),` line | 2 lines — body lives in `tab-integration.ts`. |
| `src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/index.tsx` | `import { ClaudeSdkPane } from "fork/claude-sdk/renderer/ClaudeSdkPane";` + `if (paneInfo.type === "claude-sdk") { … }` block | 8 lines. |
| `src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/GroupStrip/GroupStrip.tsx` | `addClaudeSdkTab` selector + `handleAddClaudeSdk` handler + prop on `<AddTabButton onAddClaudeSdk={…} />` | 5 lines. |
| `src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/GroupStrip/components/AddTabButton/AddTabButton.tsx` | `onAddClaudeSdk` prop + button (big mode) + dropdown item + `LuSparkles` import | ~15 lines. |
| `src/renderer/routes/_authenticated/settings/agents/components/AgentsSettings/AgentsSettings.tsx` | `import { ClaudeSdkAgentCard } from "fork/claude-sdk/renderer/ClaudeSdkAgentCard";` + `<ClaudeSdkAgentCard />` line | 2 lines. |

## Dependencies added

| Package | Reason |
|---|---|
| `@anthropic-ai/claude-agent-sdk` | The SDK itself. |
| `file-uri-to-path@1` | Transitive dep for `bindings` → `better-sqlite3` (Electron + bun hoisting workaround). |

## Native binary

The SDK ships a native CLI binary as an **optional** dependency. With bun's
`ignore-scripts=true` policy that binary doesn't get installed. We work
around this in `main/session.ts` by auto-detecting the user's existing
`claude` binary in common locations (`~/.local/bin/claude`,
`/opt/homebrew/bin/claude`, `/usr/local/bin/claude`, then `which claude`)
and passing it as `pathToClaudeCodeExecutable`.

## Architecture (one-liner)

A `ClaudeSdkSession` per chat owns:
- a `promptQueue` (AsyncIterable of `SDKUserMessage`),
- a `query()` async iteration (started in `runLoop`),
- a `pendingApprovals` map (resolves via `canUseTool`),
- an `eventHistory` for late-subscriber replay over the tRPC observable.

User messages are pushed onto the queue. SDK output is dispatched in
`handleSdkMessage` and emitted as `RuntimeEvent`s to the renderer.
