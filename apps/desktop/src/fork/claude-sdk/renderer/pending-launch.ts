/**
 * Transient pending-launch registry for Claude SDK tabs.
 *
 * When an external flow (e.g. issue → worktree → SDK tab) creates a Claude
 * SDK tab and wants to seed it with an initial prompt, it stashes the prompt
 * here keyed by paneId. The {@link ClaudeSdkPane} reads the entry on mount,
 * auto-sends, then deletes it.
 *
 * Not persisted — purely in-memory across renders.
 */
import { useTabsStore } from "renderer/stores/tabs/store";
import { create } from "zustand";

export type PendingLaunchPermissionMode =
	| "default"
	| "acceptEdits"
	| "bypassPermissions"
	| "plan";

export interface PendingLaunch {
	prompt: string;
	autoSend?: boolean;
	permissionMode?: PendingLaunchPermissionMode;
}

interface PendingLaunchState {
	pending: Record<string, PendingLaunch>;
	set: (paneId: string, launch: PendingLaunch) => void;
	consume: (paneId: string) => PendingLaunch | undefined;
}

export const useClaudeSdkPendingLaunchStore = create<PendingLaunchState>(
	(set, get) => ({
		pending: {},
		set: (paneId, launch) =>
			set((s) => ({ pending: { ...s.pending, [paneId]: launch } })),
		consume: (paneId) => {
			const launch = get().pending[paneId];
			if (!launch) return undefined;
			set((s) => {
				const next = { ...s.pending };
				delete next[paneId];
				return { pending: next };
			});
			return launch;
		},
	}),
);

/**
 * Convenience: open a Claude SDK tab in a workspace and seed it with a prompt.
 * Returns the new pane/tab IDs.
 */
export interface OpenClaudeSdkTabOptions {
	autoSend?: boolean;
	permissionMode?: PendingLaunchPermissionMode;
}

export function openClaudeSdkTabWithPrompt(
	workspaceId: string,
	prompt: string,
	options: OpenClaudeSdkTabOptions = {},
): { tabId: string; paneId: string } {
	const { autoSend = true, permissionMode } = options;
	const result = useTabsStore.getState().addClaudeSdkTab(workspaceId);
	useClaudeSdkPendingLaunchStore.getState().set(result.paneId, {
		prompt,
		autoSend,
		...(permissionMode ? { permissionMode } : {}),
	});
	return result;
}
