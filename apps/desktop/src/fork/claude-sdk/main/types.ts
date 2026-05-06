import type {
	PermissionMode,
	SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";

export type ClaudeSdkSessionId = string;
export type ClaudeSdkApprovalId = string;

export type SdkEffort = "low" | "medium" | "high" | "xhigh" | "max";

export interface StartSessionInput {
	readonly workspaceId: string;
	readonly cwd: string;
	readonly systemPrompt?: string;
	readonly model?: string;
	readonly effort?: SdkEffort;
	readonly permissionMode?: PermissionMode;
	readonly resumeSessionId?: string;
}

export interface UsageSnapshot {
	readonly inputTokens: number;
	readonly outputTokens: number;
	readonly cacheReadTokens: number;
	readonly cacheCreationTokens: number;
	readonly totalTokens: number;
	readonly contextTokens: number;
	readonly contextWindow: number;
	readonly costUsd?: number;
	readonly durationMs?: number;
	readonly numTurns?: number;
}

export interface PromptQueueMessage {
	readonly type: "message";
	readonly message: SDKUserMessage;
}
export interface PromptQueueTerminate {
	readonly type: "terminate";
}
export type PromptQueueItem = PromptQueueMessage | PromptQueueTerminate;

export interface PendingApproval {
	readonly id: ClaudeSdkApprovalId;
	readonly toolName: string;
	readonly toolInput: Record<string, unknown>;
	readonly resolve: (decision: ApprovalDecision) => void;
}
export type ApprovalDecision =
	| {
			readonly behavior: "allow";
			readonly updatedInput?: Record<string, unknown>;
	  }
	| { readonly behavior: "deny"; readonly message: string };

// `seq` is a monotonically increasing counter assigned by the session
// when the event is emitted. The renderer uses it to dedupe events on
// replay (e.g. after a pane remount) — see useClaudeSdkConversationStore
// `lastAppliedSeq`.
//
// assistant.text / assistant.thinking carry `messageId` so the renderer
// can group multiple text blocks from the same SDK message into a single
// chat bubble while keeping *different* messages as separate bubbles. This
// matches t3code's ClaudeAdapter: text is assembled in the client keyed
// by messageId, never appended blindly to "the last assistant turn".
export type RuntimeEvent =
	| {
			readonly type: "session.started";
			readonly seq: number;
			readonly sessionId: ClaudeSdkSessionId;
	  }
	| {
			readonly type: "session.ended";
			readonly seq: number;
			readonly sessionId: ClaudeSdkSessionId;
			readonly error?: string;
	  }
	| {
			readonly type: "assistant.text";
			readonly seq: number;
			readonly messageId: string;
			readonly text: string;
	  }
	| {
			readonly type: "assistant.thinking";
			readonly seq: number;
			readonly messageId: string;
			readonly text: string;
	  }
	| {
			readonly type: "tool.use";
			readonly seq: number;
			readonly toolUseId: string;
			readonly toolName: string;
			readonly input: unknown;
	  }
	| {
			readonly type: "tool.result";
			readonly seq: number;
			readonly toolUseId: string;
			readonly output: unknown;
			readonly isError: boolean;
	  }
	| {
			readonly type: "approval.requested";
			readonly seq: number;
			readonly approvalId: ClaudeSdkApprovalId;
			readonly toolName: string;
			readonly input: Record<string, unknown>;
	  }
	| {
			readonly type: "approval.resolved";
			readonly seq: number;
			readonly approvalId: ClaudeSdkApprovalId;
			readonly decision: "allow" | "deny";
	  }
	| { readonly type: "turn.started"; readonly seq: number }
	| {
			readonly type: "turn.completed";
			readonly seq: number;
			readonly resumeSessionId?: string;
			readonly usage?: UsageSnapshot;
	  }
	| {
			readonly type: "usage.updated";
			readonly seq: number;
			readonly usage: UsageSnapshot;
	  }
	| {
			readonly type: "model.info";
			readonly seq: number;
			readonly model: string;
	  }
	| { readonly type: "error"; readonly seq: number; readonly message: string };
