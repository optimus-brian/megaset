/**
 * Per-pane conversation state for the Claude SDK pane.
 *
 * The pane component unmounts when the user navigates to a different tab/
 * pane, so `useState` on its own loses turns, usage, and the active session
 * id. This Zustand store keeps that state alive across remounts (within the
 * app session).
 *
 * Not persisted to disk — purely in-memory. The durable resumeSessionId is
 * still round-tripped via `claudeSdk.getResumeId`/`setResumeId`.
 */
import { create } from "zustand";

export type Turn =
	| { kind: "user"; text: string }
	| { kind: "assistant"; messageId: string; text: string }
	| { kind: "thinking"; messageId: string; text: string }
	| {
			kind: "tool";
			id: string;
			name: string;
			input: unknown;
			resultText?: string;
			isError?: boolean;
	  }
	| {
			kind: "approval";
			approvalId: string;
			toolName: string;
			input: Record<string, unknown>;
			resolved?: "allow" | "deny";
	  };

export interface UsageState {
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheCreationTokens: number;
	totalTokens: number;
	contextTokens: number;
	contextWindow: number;
	costUsd?: number;
	durationMs?: number;
	numTurns?: number;
}

export interface PaneConversation {
	turns: Turn[];
	sessionId: string | null;
	running: boolean;
	usage: UsageState | null;
	activeModel: string | null;
	inputDraft: string;
	// Highest event seq the renderer has applied into `turns`. The
	// subscription tells the backend to replay from here on (re)connect,
	// which means remounts are cheap and replay is always idempotent.
	lastAppliedSeq: number;
}

const emptyConversation = (): PaneConversation => ({
	turns: [],
	sessionId: null,
	running: false,
	usage: null,
	activeModel: null,
	inputDraft: "",
	lastAppliedSeq: 0,
});

interface ConversationStoreState {
	conversations: Record<string, PaneConversation>;
	ensure: (paneId: string) => PaneConversation;
	patch: (paneId: string, patch: Partial<PaneConversation>) => void;
	updateTurns: (
		paneId: string,
		updater: (prev: Turn[]) => Turn[],
	) => void;
	reset: (paneId: string) => void;
	remove: (paneId: string) => void;
}

export const useClaudeSdkConversationStore = create<ConversationStoreState>(
	(set, get) => ({
		conversations: {},
		ensure: (paneId) => {
			const existing = get().conversations[paneId];
			if (existing) return existing;
			const next = emptyConversation();
			set((s) => ({
				conversations: { ...s.conversations, [paneId]: next },
			}));
			return next;
		},
		patch: (paneId, patch) => {
			set((s) => {
				const current = s.conversations[paneId] ?? emptyConversation();
				return {
					conversations: {
						...s.conversations,
						[paneId]: { ...current, ...patch },
					},
				};
			});
		},
		updateTurns: (paneId, updater) => {
			set((s) => {
				const current = s.conversations[paneId] ?? emptyConversation();
				return {
					conversations: {
						...s.conversations,
						[paneId]: { ...current, turns: updater(current.turns) },
					},
				};
			});
		},
		reset: (paneId) => {
			set((s) => ({
				conversations: {
					...s.conversations,
					[paneId]: emptyConversation(),
				},
			}));
		},
		remove: (paneId) => {
			set((s) => {
				if (!(paneId in s.conversations)) return s;
				const next = { ...s.conversations };
				delete next[paneId];
				return { conversations: next };
			});
		},
	}),
);
