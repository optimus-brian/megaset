import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import EventEmitter from "node:events";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	type CanUseTool,
	type Options as ClaudeQueryOptions,
	query,
	type SDKMessage,
	type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type {
	ApprovalDecision,
	ClaudeSdkSessionId,
	PendingApproval,
	PromptQueueItem,
	RuntimeEvent,
	StartSessionInput,
	UsageSnapshot,
} from "./types";

function findClaudeBinary(): string | undefined {
	const candidates = [
		join(homedir(), ".local", "bin", "claude"),
		"/opt/homebrew/bin/claude",
		"/usr/local/bin/claude",
	];
	for (const p of candidates) {
		if (existsSync(p)) return p;
	}
	try {
		const out = execSync("which claude", {
			encoding: "utf-8",
			env: {
				...process.env,
				PATH: `${process.env.PATH ?? ""}:${homedir()}/.local/bin:/opt/homebrew/bin:/usr/local/bin`,
			},
		}).trim();
		if (out && existsSync(out)) return out;
	} catch {}
	return undefined;
}

let cachedClaudeBinary: string | undefined | null = null;
function getClaudeBinary(): string | undefined {
	if (cachedClaudeBinary === null) {
		cachedClaudeBinary = findClaudeBinary();
		console.log("[claude-sdk] resolved claude binary:", cachedClaudeBinary);
	}
	return cachedClaudeBinary ?? undefined;
}

class AsyncQueue<T> {
	private readonly buffer: T[] = [];
	private readonly waiters: Array<(v: IteratorResult<T>) => void> = [];
	private closed = false;

	push(item: T): void {
		const waiter = this.waiters.shift();
		if (waiter) waiter({ value: item, done: false });
		else this.buffer.push(item);
	}
	close(): void {
		this.closed = true;
		while (this.waiters.length) {
			const w = this.waiters.shift();
			w?.({ value: undefined as unknown as T, done: true });
		}
	}
	[Symbol.asyncIterator](): AsyncIterator<T> {
		return {
			next: (): Promise<IteratorResult<T>> => {
				if (this.buffer.length) {
					return Promise.resolve({ value: this.buffer.shift()!, done: false });
				}
				if (this.closed) {
					return Promise.resolve({ value: undefined as unknown as T, done: true });
				}
				return new Promise<IteratorResult<T>>((resolve) => {
					this.waiters.push(resolve);
				});
			},
		};
	}
}

export class ClaudeSdkSession extends EventEmitter {
	readonly id: ClaudeSdkSessionId;
	readonly workspaceId: string;
	private readonly promptQueue = new AsyncQueue<PromptQueueItem>();
	private readonly pendingApprovals = new Map<string, PendingApproval>();
	private readonly eventHistory: RuntimeEvent[] = [];
	private resumeSessionId: string | undefined;
	private stopped = false;
	private started = false;
	private contextWindow = 200_000;

	constructor(input: StartSessionInput) {
		super();
		this.id = randomUUID();
		this.workspaceId = input.workspaceId;
		this.resumeSessionId = input.resumeSessionId;
	}

	replayEvents(): RuntimeEvent[] {
		return [...this.eventHistory];
	}

	emitEvent(event: RuntimeEvent): void {
		this.eventHistory.push(event);
		console.log("[claude-sdk]", this.id.slice(0, 8), event.type);
		this.emit("event", event);
	}

	start(input: StartSessionInput): void {
		if (this.started) return;
		this.started = true;

		const autoAllowTools =
			input.permissionMode === "plan"
				? new Set(["Read", "Grep", "Glob"])
				: new Set<string>();

		const canUseTool: CanUseTool = async (toolName, toolInput, _opts) => {
			if (this.stopped) {
				return { behavior: "deny", message: "Session stopped." };
			}
			if (autoAllowTools.has(toolName)) {
				return {
					behavior: "allow",
					updatedInput: toolInput as Record<string, unknown>,
				};
			}
			const approvalId = randomUUID();
			const decision = await new Promise<ApprovalDecision>((resolve) => {
				this.pendingApprovals.set(approvalId, {
					id: approvalId,
					toolName,
					toolInput: toolInput as Record<string, unknown>,
					resolve,
				});
				this.emitEvent({
					type: "approval.requested",
					approvalId,
					toolName,
					input: toolInput as Record<string, unknown>,
				});
			});
			this.pendingApprovals.delete(approvalId);
			this.emitEvent({
				type: "approval.resolved",
				approvalId,
				decision: decision.behavior,
			});
			return decision;
		};

		const claudeBinary = getClaudeBinary();
		const options: ClaudeQueryOptions = {
			cwd: input.cwd,
			...(claudeBinary ? { pathToClaudeCodeExecutable: claudeBinary } : {}),
			...(input.model ? { model: input.model } : {}),
			...(input.effort ? { effort: input.effort } : {}),
			...(input.systemPrompt
				? { systemPrompt: input.systemPrompt }
				: { systemPrompt: { type: "preset", preset: "claude_code" } }),
			permissionMode: input.permissionMode ?? "default",
			...(input.permissionMode === "bypassPermissions"
				? { allowDangerouslySkipPermissions: true }
				: {}),
			...(this.resumeSessionId ? { resume: this.resumeSessionId } : {}),
			includePartialMessages: true,
			canUseTool,
			env: {
				...(process.env as Record<string, string>),
				PATH: `${process.env.PATH ?? ""}:${homedir()}/.local/bin:/opt/homebrew/bin:/usr/local/bin`,
			},
			additionalDirectories: [input.cwd],
			settingSources: ["project"],
			stderr: (data: string) => {
				console.warn("[claude-sdk stderr]", this.id.slice(0, 8), data);
			},
		};

		this.emitEvent({ type: "session.started", sessionId: this.id });
		this.runLoop(options).catch((err) => {
			console.error("[claude-sdk] runLoop failed:", err);
			this.emitEvent({
				type: "error",
				message: err instanceof Error ? err.message : String(err),
			});
			this.emitEvent({
				type: "session.ended",
				sessionId: this.id,
				error: err instanceof Error ? err.message : String(err),
			});
		});
	}

	private async runLoop(options: ClaudeQueryOptions): Promise<void> {
		const promptIterable: AsyncIterable<SDKUserMessage> = {
			[Symbol.asyncIterator]: () => {
				const iter = this.promptQueue[Symbol.asyncIterator]();
				return {
					next: async () => {
						while (true) {
							const { value, done } = await iter.next();
							if (done) return { value: undefined as never, done: true };
							if (value.type === "terminate") {
								return { value: undefined as never, done: true };
							}
							return { value: value.message, done: false };
						}
					},
				};
			},
		};

		for await (const message of query({ prompt: promptIterable, options })) {
			if (this.stopped) break;
			this.handleSdkMessage(message);
		}
		this.emitEvent({ type: "session.ended", sessionId: this.id });
	}

	private handleSdkMessage(msg: SDKMessage): void {
		switch (msg.type) {
			case "system": {
				const s = msg as { subtype?: string; model?: string };
				if (s.model) {
					if (/opus-4|sonnet-4-6/.test(s.model)) {
						this.contextWindow = 1_000_000;
					} else if (/haiku-4/.test(s.model)) {
						this.contextWindow = 200_000;
					}
					this.emitEvent({ type: "model.info", model: s.model });
				}
				return;
			}
			case "assistant": {
				for (const block of msg.message.content) {
					if (block.type === "text" && block.text) {
						this.emitEvent({ type: "assistant.text", text: block.text });
					} else if (block.type === "thinking" && block.thinking) {
						this.emitEvent({ type: "assistant.thinking", text: block.thinking });
					} else if (block.type === "tool_use") {
						this.emitEvent({
							type: "tool.use",
							toolUseId: block.id,
							toolName: block.name,
							input: block.input,
						});
					}
				}
				return;
			}
			case "user": {
				const content = msg.message.content;
				if (Array.isArray(content)) {
					for (const block of content) {
						if (
							typeof block === "object" &&
							block !== null &&
							"type" in block &&
							block.type === "tool_result"
						) {
							const b = block as {
								tool_use_id: string;
								content: unknown;
								is_error?: boolean;
							};
							this.emitEvent({
								type: "tool.result",
								toolUseId: b.tool_use_id,
								output: b.content,
								isError: !!b.is_error,
							});
						}
					}
				}
				return;
			}
			case "result": {
				const r = msg as {
					session_id?: string;
					total_cost_usd?: number;
					duration_ms?: number;
					num_turns?: number;
					usage?: {
						input_tokens?: number;
						output_tokens?: number;
						cache_read_input_tokens?: number;
						cache_creation_input_tokens?: number;
					};
				};
				if (r.session_id) this.resumeSessionId = r.session_id;
				let usage: UsageSnapshot | undefined;
				if (r.usage) {
					const inputTokens = r.usage.input_tokens ?? 0;
					const outputTokens = r.usage.output_tokens ?? 0;
					const cacheReadTokens = r.usage.cache_read_input_tokens ?? 0;
					const cacheCreationTokens = r.usage.cache_creation_input_tokens ?? 0;
					const contextTokens =
						inputTokens + cacheReadTokens + cacheCreationTokens;
					usage = {
						inputTokens,
						outputTokens,
						cacheReadTokens,
						cacheCreationTokens,
						totalTokens:
							inputTokens +
							outputTokens +
							cacheReadTokens +
							cacheCreationTokens,
						contextTokens,
						contextWindow: this.contextWindow,
						costUsd: r.total_cost_usd,
						durationMs: r.duration_ms,
						numTurns: r.num_turns,
					};
					this.emitEvent({ type: "usage.updated", usage });
				}
				this.emitEvent({
					type: "turn.completed",
					resumeSessionId: this.resumeSessionId,
					...(usage ? { usage } : {}),
				});
				return;
			}
			default:
				return;
		}
	}

	sendUserMessage(text: string): void {
		if (this.stopped) return;
		const sdkMsg: SDKUserMessage = {
			type: "user",
			message: {
				role: "user",
				content: [{ type: "text", text }],
			},
			parent_tool_use_id: null,
			session_id: this.resumeSessionId ?? this.id,
		};
		this.promptQueue.push({ type: "message", message: sdkMsg });
	}

	resolveApproval(approvalId: string, decision: ApprovalDecision): boolean {
		const pending = this.pendingApprovals.get(approvalId);
		if (!pending) return false;
		pending.resolve(decision);
		return true;
	}

	stop(): void {
		if (this.stopped) return;
		this.stopped = true;
		for (const p of this.pendingApprovals.values()) {
			p.resolve({ behavior: "deny", message: "Session stopped." });
		}
		this.pendingApprovals.clear();
		this.promptQueue.push({ type: "terminate" });
		this.promptQueue.close();
	}
}
