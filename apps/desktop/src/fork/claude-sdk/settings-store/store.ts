import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export type ClaudeSdkModel = "default" | string;
export type ClaudeSdkEffort =
	| "default"
	| "low"
	| "medium"
	| "high"
	| "xhigh"
	| "max";
export type ClaudeSdkPermission =
	| "default"
	| "acceptEdits"
	| "bypassPermissions"
	| "plan";

export interface StatusBarVisibility {
	model: boolean;
	effort: boolean;
	permission: boolean;
	activeModel: boolean;
	contextRing: boolean;
	contextDetail: boolean;
	totalTokens: boolean;
	outputTokens: boolean;
	cacheTokens: boolean;
	cost: boolean;
	duration: boolean;
	turns: boolean;
	cwd: boolean;
}

export const DEFAULT_STATUS_BAR: StatusBarVisibility = {
	model: true,
	effort: true,
	permission: true,
	activeModel: true,
	contextRing: true,
	contextDetail: true,
	totalTokens: true,
	outputTokens: true,
	cacheTokens: true,
	cost: true,
	duration: true,
	turns: true,
	cwd: true,
};

interface ClaudeSdkSettingsState {
	enabled: boolean;
	defaultModel: ClaudeSdkModel;
	defaultEffort: ClaudeSdkEffort;
	defaultPermission: ClaudeSdkPermission;
	statusBar: StatusBarVisibility;

	setEnabled: (v: boolean) => void;
	setDefaultModel: (v: ClaudeSdkModel) => void;
	setDefaultEffort: (v: ClaudeSdkEffort) => void;
	setDefaultPermission: (v: ClaudeSdkPermission) => void;
	setStatusBarField: (key: keyof StatusBarVisibility, v: boolean) => void;
	resetStatusBar: () => void;
}

export const useClaudeSdkSettingsStore = create<ClaudeSdkSettingsState>()(
	devtools(
		persist(
			(set) => ({
				enabled: true,
				defaultModel: "default",
				defaultEffort: "default",
				defaultPermission: "default",
				statusBar: DEFAULT_STATUS_BAR,

				setEnabled: (v) => set({ enabled: v }),
				setDefaultModel: (v) => set({ defaultModel: v }),
				setDefaultEffort: (v) => set({ defaultEffort: v }),
				setDefaultPermission: (v) => set({ defaultPermission: v }),
				setStatusBarField: (key, v) =>
					set((s) => ({ statusBar: { ...s.statusBar, [key]: v } })),
				resetStatusBar: () => set({ statusBar: DEFAULT_STATUS_BAR }),
			}),
			{ name: "claude-sdk-settings" },
		),
		{ name: "claude-sdk-settings" },
	),
);
