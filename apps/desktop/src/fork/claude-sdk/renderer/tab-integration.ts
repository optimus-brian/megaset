/**
 * Tab system integration helpers for Claude SDK pane.
 *
 * Keeps all the small additions the upstream tab store needs in one place
 * so the store only has to import {@link createAddClaudeSdkTabAction} and
 * spread the returned action into its zustand factory.
 */
import type { Pane, Tab, TabsStore } from "renderer/stores/tabs/types";

export const CLAUDE_SDK_PANE_TYPE = "claude-sdk" as const;

const generateId = (prefix: string) =>
	`${prefix}_${crypto.randomUUID().slice(0, 8)}`;

export function createClaudeSdkPane(tabId: string): Pane {
	return {
		id: generateId("pane"),
		tabId,
		type: CLAUDE_SDK_PANE_TYPE,
		name: "Claude SDK",
	};
}

export function createClaudeSdkTabWithPane(workspaceId: string): {
	tab: Tab;
	pane: Pane;
} {
	const tabId = generateId("tab");
	const pane = createClaudeSdkPane(tabId);
	const tab: Tab = {
		id: tabId,
		name: "Claude SDK",
		workspaceId,
		layout: pane.id,
		createdAt: Date.now(),
	};
	return { tab, pane };
}

/**
 * Builds the `addClaudeSdkTab` action for the zustand tab store.
 * Used by `renderer/stores/tabs/store.ts` — keeps that file's diff to one line.
 */
export function createAddClaudeSdkTabAction(
	set: (state: Partial<TabsStore>) => void,
	get: () => TabsStore,
): TabsStore["addClaudeSdkTab"] {
	return (workspaceId: string) => {
		const state = get();
		const { tab, pane } = createClaudeSdkTabWithPane(workspaceId);
		const currentActiveId = state.activeTabIds[workspaceId];
		const historyStack = state.tabHistoryStacks[workspaceId] || [];
		const newHistoryStack = currentActiveId
			? [
					currentActiveId,
					...historyStack.filter((id) => id !== currentActiveId),
				]
			: historyStack;

		set({
			tabs: [...state.tabs, tab],
			panes: { ...state.panes, [pane.id]: pane },
			activeTabIds: {
				...state.activeTabIds,
				[workspaceId]: tab.id,
			},
			focusedPaneIds: {
				...state.focusedPaneIds,
				[tab.id]: pane.id,
			},
			tabHistoryStacks: {
				...state.tabHistoryStacks,
				[workspaceId]: newHistoryStack,
			},
		});
		return { tabId: tab.id, paneId: pane.id };
	};
}
