import { Button } from "@superset/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { toast } from "@superset/ui/sonner";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	HiOutlineChevronDown,
	HiOutlineChevronRight,
	HiOutlineSparkles,
	HiOutlineWrenchScrewdriver,
} from "react-icons/hi2";
import { LuSquare } from "react-icons/lu";
import { useClaudeSdkPendingLaunchStore } from "fork/claude-sdk/renderer/pending-launch";
import {
	type StatusBarVisibility,
	useClaudeSdkSettingsStore,
} from "fork/claude-sdk/settings-store";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { Streamdown } from "streamdown";

interface ClaudeSdkPaneProps {
	paneId: string;
	workspaceId: string;
}

type Turn =
	| { kind: "user"; text: string }
	| { kind: "assistant"; text: string }
	| { kind: "thinking"; text: string }
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

type UsageState = {
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
};

const MODEL_OPTIONS = [
	{ value: "default", label: "Default", short: "auto" },
	{ value: "claude-opus-4-7", label: "Opus 4.7", short: "opus-4.7" },
	{ value: "claude-sonnet-4-6", label: "Sonnet 4.6", short: "sonnet-4.6" },
	{ value: "claude-haiku-4-5", label: "Haiku 4.5", short: "haiku-4.5" },
];

const EFFORT_OPTIONS = [
	{ value: "default", label: "Default", short: "—" },
	{ value: "low", label: "Low", short: "low" },
	{ value: "medium", label: "Medium", short: "med" },
	{ value: "high", label: "High", short: "high" },
	{ value: "xhigh", label: "X-High", short: "xhigh" },
	{ value: "max", label: "Max", short: "max" },
];

const PERMISSION_OPTIONS = [
	{ value: "default", label: "Ask", short: "ask" },
	{ value: "acceptEdits", label: "Accept edits", short: "edits" },
	{ value: "bypassPermissions", label: "Bypass", short: "bypass" },
	{ value: "plan", label: "Plan", short: "plan" },
];

function formatTokens(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
	return String(n);
}

function formatDuration(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
	const mins = Math.floor(ms / 60_000);
	const secs = Math.floor((ms % 60_000) / 1000);
	return `${mins}m${secs}s`;
}

function formatPath(path: string): string {
	const home = "/Users/";
	if (path.startsWith(home)) {
		const rest = path.slice(home.length);
		const slash = rest.indexOf("/");
		if (slash > 0) return `~${rest.slice(slash)}`;
	}
	return path;
}

export function ClaudeSdkPane({ paneId, workspaceId }: ClaudeSdkPaneProps) {
	const { data: workspace } = electronTrpc.workspaces.get.useQuery(
		{ id: workspaceId },
		{ enabled: !!workspaceId },
	);
	const cwd = workspace?.worktreePath ?? "";

	const sdkSettings = useClaudeSdkSettingsStore();
	const statusBarVisibility = sdkSettings.statusBar;

	const [sessionId, setSessionId] = useState<string | null>(null);
	const [resumeSessionId, setResumeSessionId] = useState<string | null>(null);
	const [turns, setTurns] = useState<Turn[]>([]);
	const [input, setInput] = useState("");
	const [running, setRunning] = useState(false);
	const [model, setModel] = useState<string>(sdkSettings.defaultModel);
	const [effort, setEffort] = useState<string>(sdkSettings.defaultEffort);
	const [permissionMode, setPermissionMode] = useState<string>(
		sdkSettings.defaultPermission,
	);

	if (!sdkSettings.enabled) {
		return (
			<div className="flex flex-col items-center justify-center h-full text-sm text-muted-foreground gap-2 p-6 text-center">
				<HiOutlineSparkles className="size-10 opacity-30" />
				<p className="font-medium">Claude SDK is disabled</p>
				<p className="text-xs">
					Enable it in Settings → Agents → Claude SDK.
				</p>
			</div>
		);
	}
	const [usage, setUsage] = useState<UsageState | null>(null);
	const [activeModel, setActiveModel] = useState<string | null>(null);
	const scrollRef = useRef<HTMLDivElement>(null);

	const startSession = electronTrpc.claudeSdk.startSession.useMutation();
	const sendMessage = electronTrpc.claudeSdk.sendMessage.useMutation();
	const stopSession = electronTrpc.claudeSdk.stopSession.useMutation();
	const approveTool = electronTrpc.claudeSdk.approveTool.useMutation();

	electronTrpc.claudeSdk.events.useSubscription(
		sessionId ? { sessionId } : (undefined as never),
		{
			enabled: !!sessionId,
			onData: (event) => {
				setTurns((prev) => {
					const next = [...prev];
					switch (event.type) {
						case "assistant.text": {
							const last = next[next.length - 1];
							if (last && last.kind === "assistant") {
								next[next.length - 1] = {
									...last,
									text: last.text + event.text,
								};
							} else {
								next.push({ kind: "assistant", text: event.text });
							}
							return next;
						}
						case "assistant.thinking": {
							const last = next[next.length - 1];
							if (last && last.kind === "thinking") {
								next[next.length - 1] = {
									...last,
									text: last.text + event.text,
								};
							} else {
								next.push({ kind: "thinking", text: event.text });
							}
							return next;
						}
						case "tool.use":
							next.push({
								kind: "tool",
								id: event.toolUseId,
								name: event.toolName,
								input: event.input,
							});
							return next;
						case "tool.result": {
							for (let i = next.length - 1; i >= 0; i--) {
								const t = next[i];
								if (t.kind === "tool" && t.id === event.toolUseId) {
									next[i] = {
										...t,
										resultText:
											typeof event.output === "string"
												? event.output
												: JSON.stringify(event.output, null, 2),
										isError: event.isError,
									};
									break;
								}
							}
							return next;
						}
						case "approval.requested":
							next.push({
								kind: "approval",
								approvalId: event.approvalId,
								toolName: event.toolName,
								input: event.input,
							});
							return next;
						case "approval.resolved": {
							for (let i = next.length - 1; i >= 0; i--) {
								const t = next[i];
								if (
									t.kind === "approval" &&
									t.approvalId === event.approvalId
								) {
									next[i] = { ...t, resolved: event.decision };
									break;
								}
							}
							return next;
						}
						case "turn.completed":
							setRunning(false);
							if (event.usage) setUsage(event.usage);
							if (event.resumeSessionId)
								setResumeSessionId(event.resumeSessionId);
							return next;
						case "usage.updated":
							setUsage(event.usage);
							return next;
						case "model.info":
							setActiveModel(event.model);
							return next;
						case "session.ended":
							setRunning(false);
							setSessionId(null);
							return next;
						case "error":
							toast.error(event.message);
							return next;
						default:
							return next;
					}
				});
			},
			onError: (err) => {
				toast.error(`SDK stream error: ${err.message}`);
				setRunning(false);
			},
		},
	);

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		el.scrollTop = el.scrollHeight;
	}, [turns.length]);

	const handleSend = async () => {
		const text = input.trim();
		if (!text || !cwd) return;
		setInput("");
		setTurns((prev) => [...prev, { kind: "user", text }]);
		setRunning(true);
		try {
			let sid = sessionId;
			if (!sid) {
				const result = await startSession.mutateAsync({
					workspaceId,
					cwd,
					...(model !== "default" ? { model } : {}),
					...(effort !== "default"
						? { effort: effort as "low" | "medium" | "high" | "xhigh" | "max" }
						: {}),
					permissionMode: permissionMode as
						| "default"
						| "acceptEdits"
						| "bypassPermissions"
						| "plan",
					...(resumeSessionId ? { resumeSessionId } : {}),
				});
				sid = result.sessionId;
				setSessionId(sid);
			}
			await sendMessage.mutateAsync({ sessionId: sid, text });
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to send message",
			);
			setRunning(false);
		}
	};

	// Consume pending launch (e.g. issue → SDK tab) once cwd is ready.
	const consumedRef = useRef(false);
	const consumePendingLaunch = useClaudeSdkPendingLaunchStore((s) => s.consume);
	useEffect(() => {
		if (consumedRef.current) return;
		if (!cwd) return;
		const launch = consumePendingLaunch(paneId);
		if (!launch) {
			consumedRef.current = true;
			return;
		}
		consumedRef.current = true;
		setInput(launch.prompt);
		const launchPermission = launch.permissionMode;
		if (launchPermission) setPermissionMode(launchPermission);
		if (launch.autoSend) {
			// Defer to next microtask so React commits the input state first.
			queueMicrotask(() => {
				const text = launch.prompt.trim();
				if (!text) return;
				setInput("");
				setTurns((prev) => [...prev, { kind: "user", text }]);
				setRunning(true);
				const effectivePermission = launchPermission ?? permissionMode;
				startSession
					.mutateAsync({
						workspaceId,
						cwd,
						...(model !== "default" ? { model } : {}),
						...(effort !== "default"
							? {
									effort: effort as
										| "low"
										| "medium"
										| "high"
										| "xhigh"
										| "max",
								}
							: {}),
						permissionMode: effectivePermission as
							| "default"
							| "acceptEdits"
							| "bypassPermissions"
							| "plan",
					})
					.then(({ sessionId: sid }) => {
						setSessionId(sid);
						return sendMessage.mutateAsync({ sessionId: sid, text });
					})
					.catch((err) => {
						toast.error(
							err instanceof Error ? err.message : "Failed to send message",
						);
						setRunning(false);
					});
			});
		}
	}, [
		cwd,
		paneId,
		consumePendingLaunch,
		workspaceId,
		model,
		effort,
		permissionMode,
		startSession,
		sendMessage,
	]);

	const handleApprove = (approvalId: string, decision: "allow" | "deny") => {
		if (!sessionId) return;
		approveTool.mutate({
			sessionId,
			approvalId,
			decision:
				decision === "allow"
					? { behavior: "allow" }
					: { behavior: "deny", message: "User declined." },
		});
	};

	const handleAnswerQuestion = (approvalId: string, answer: string) => {
		if (!sessionId) return;
		approveTool.mutate({
			sessionId,
			approvalId,
			decision: {
				behavior: "deny",
				message: `User answered AskUserQuestion. Treat this as the tool's response and continue based on these answers:\n\n${answer}`,
			},
		});
	};

	const handleStop = () => {
		if (!sessionId) return;
		stopSession.mutate({ sessionId });
	};

	const restartOnSettingChange = (_label: string) => {
		if (sessionId) {
			// Silently stop the current SDK subprocess. Context is preserved via
			// resumeSessionId — the next message transparently starts a fresh
			// subprocess with the new setting and resumes the same conversation.
			stopSession.mutate({ sessionId });
			setSessionId(null);
			setActiveModel(null);
			setRunning(false);
		}
	};

	const handleModelChange = (v: string) => {
		setModel(v);
		restartOnSettingChange("Model");
	};
	const handleEffortChange = (v: string) => {
		setEffort(v);
		restartOnSettingChange("Effort");
	};
	const handlePermissionChange = (v: string) => {
		setPermissionMode(v);
		restartOnSettingChange("Permission mode");
	};

	const handleNewChat = () => {
		if (sessionId) stopSession.mutate({ sessionId });
		setSessionId(null);
		setResumeSessionId(null);
		setTurns([]);
		setUsage(null);
		setActiveModel(null);
		setRunning(false);
	};

	const contextPct = useMemo(() => {
		if (!usage || !usage.contextWindow) return 0;
		return Math.min(100, (usage.contextTokens / usage.contextWindow) * 100);
	}, [usage]);

	const contextColor = useMemo(() => {
		if (contextPct < 50) return "bg-green-500";
		if (contextPct < 80) return "bg-amber-500";
		return "bg-red-500";
	}, [contextPct]);

	return (
		<div className="flex flex-col h-full bg-background">
			{/* Message list */}
			<div ref={scrollRef} className="flex-1 overflow-y-auto">
				<div className="p-4 space-y-4">
					{turns.length === 0 && (
						<div className="text-center text-xs text-muted-foreground py-12">
							<HiOutlineSparkles className="size-8 mx-auto mb-2 opacity-30" />
							<p>Send a message to start a Claude session.</p>
							<p className="mt-1 opacity-60 font-mono">{formatPath(cwd) || "—"}</p>
						</div>
					)}
					{turns.map((turn, idx) => (
						<TurnView
							key={idx}
							turn={turn}
							onApprove={handleApprove}
							onAnswerQuestion={handleAnswerQuestion}
						/>
					))}
					{running && (
						<div className="flex items-center gap-2 text-xs text-muted-foreground">
							<span className="inline-block size-2 rounded-full bg-amber-500 animate-pulse" />
							<span>Claude is working…</span>
						</div>
					)}
				</div>
			</div>

			{/* Input area — full width */}
			<div className="border-t border-border bg-muted/10 p-3">
				<div className="flex gap-2">
					<textarea
						value={input}
						onChange={(e) => setInput(e.target.value)}
						placeholder="Message Claude…  (⌘+Enter to send)"
						rows={2}
						disabled={!cwd}
						className="flex-1 text-sm bg-background border border-border rounded-md px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
						onKeyDown={(e) => {
							if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
								e.preventDefault();
								handleSend();
							}
						}}
					/>
					<Button
						size="sm"
						onClick={handleSend}
						disabled={!input.trim() || !cwd}
					>
						Send
					</Button>
				</div>
			</div>

			{/* Status bar — like t8code ccstatusline, responsive */}
			<StatusBar
				model={model}
				setModel={handleModelChange}
				effort={effort}
				setEffort={handleEffortChange}
				permissionMode={permissionMode}
				setPermissionMode={handlePermissionChange}
				activeModel={activeModel}
				usage={usage}
				cwd={cwd}
				running={running}
				sessionId={sessionId}
				contextPct={contextPct}
				visibility={statusBarVisibility}
				onStop={handleStop}
				onNewChat={handleNewChat}
			/>
		</div>
	);
}

interface StatusBarProps {
	model: string;
	setModel: (v: string) => void;
	effort: string;
	setEffort: (v: string) => void;
	permissionMode: string;
	setPermissionMode: (v: string) => void;
	activeModel: string | null;
	usage: UsageState | null;
	cwd: string;
	running: boolean;
	sessionId: string | null;
	contextPct: number;
	visibility: StatusBarVisibility;
	onStop: () => void;
	onNewChat: () => void;
}

function StatusBar({
	model,
	setModel,
	effort,
	setEffort,
	permissionMode,
	setPermissionMode,
	activeModel,
	usage,
	cwd,
	running,
	sessionId,
	contextPct,
	visibility,
	onStop,
	onNewChat,
}: StatusBarProps) {
	const items: React.ReactNode[] = [];
	const sep = <PillSeparator />;
	const push = (key: string, node: React.ReactNode) => {
		if (items.length > 0)
			items.push(<span key={`sep-${key}`}>{sep}</span>);
		items.push(<span key={key}>{node}</span>);
	};

	if (visibility.model)
		push(
			"model",
			<PillSelect
				value={model}
				onValueChange={setModel}
				options={MODEL_OPTIONS}
				label="model"
			/>,
		);
	if (visibility.effort)
		push(
			"effort",
			<PillSelect
				value={effort}
				onValueChange={setEffort}
				options={EFFORT_OPTIONS}
				label="effort"
			/>,
		);
	if (visibility.permission)
		push(
			"perm",
			<PillSelect
				value={permissionMode}
				onValueChange={setPermissionMode}
				options={PERMISSION_OPTIONS}
				label="perm"
			/>,
		);
	if (visibility.activeModel && activeModel)
		push(
			"active",
			<span
				className="px-1 truncate max-w-[120px] hidden md:inline"
				title={`Active: ${activeModel}`}
			>
				{activeModel.replace(/^claude-/, "")}
			</span>,
		);

	if (usage) {
		if (visibility.contextRing || visibility.contextDetail) {
			push(
				"ctx",
				<div
					className="flex items-center gap-1.5 px-1 shrink-0"
					title={`Context: ${formatTokens(usage.contextTokens)} / ${formatTokens(usage.contextWindow)} (${contextPct.toFixed(0)}%)`}
				>
					{visibility.contextRing && <ContextRing pct={contextPct} />}
					{visibility.contextDetail && (
						<>
							<span className="hidden sm:inline">
								{formatTokens(usage.contextTokens)}
								<span className="opacity-50">
									/{formatTokens(usage.contextWindow)}
								</span>
							</span>
							<span className="sm:hidden">{contextPct.toFixed(0)}%</span>
						</>
					)}
				</div>,
			);
		}
		if (visibility.totalTokens)
			push(
				"total",
				<span
					className="px-1 hidden lg:inline shrink-0"
					title="Total tokens (input + output + cache)"
				>
					⇅ {formatTokens(usage.totalTokens)}
				</span>,
			);
		if (visibility.outputTokens && usage.outputTokens > 0)
			push(
				"out",
				<span
					className="px-1 hidden lg:inline shrink-0"
					title="Output tokens this turn"
				>
					↓ {formatTokens(usage.outputTokens)}
				</span>,
			);
		if (visibility.cacheTokens && usage.cacheReadTokens > 0)
			push(
				"cache",
				<span
					className="px-1 hidden xl:inline shrink-0"
					title="Cache read tokens"
				>
					⊙ {formatTokens(usage.cacheReadTokens)}
				</span>,
			);
		if (visibility.cost && usage.costUsd !== undefined)
			push(
				"cost",
				<span
					className="px-1 hidden md:inline shrink-0"
					title="Session cost USD"
				>
					${usage.costUsd.toFixed(4)}
				</span>,
			);
		if (visibility.duration && usage.durationMs !== undefined)
			push(
				"dur",
				<span
					className="px-1 hidden md:inline shrink-0"
					title="Last turn duration"
				>
					{formatDuration(usage.durationMs)}
				</span>,
			);
		if (visibility.turns && usage.numTurns !== undefined)
			push(
				"turns",
				<span
					className="px-1 hidden md:inline shrink-0"
					title="Turns in session"
				>
					{usage.numTurns}t
				</span>,
			);
	}

	return (
		<div className="border-t border-border bg-muted/30 px-2 py-1 flex items-center gap-1 text-[11px] font-mono text-muted-foreground select-none overflow-hidden">
			<HiOutlineSparkles className="size-3 shrink-0" />
			{items}

			<div className="ml-auto flex items-center gap-1 shrink-0">
				{visibility.cwd && cwd && (
					<>
						<span
							className="hidden md:inline truncate max-w-[180px]"
							title={cwd}
						>
							{formatPath(cwd)}
						</span>
						<PillSeparator />
					</>
				)}
				{running && (
					<span
						className="flex items-center gap-1 text-amber-500 px-1"
						title="Running"
					>
						<span className="inline-block size-1.5 rounded-full bg-amber-500 animate-pulse" />
						<span className="hidden sm:inline">running</span>
					</span>
				)}
				{sessionId && (
					<button
						type="button"
						onClick={onStop}
						className="px-1.5 py-0.5 rounded hover:bg-muted/60 hover:text-foreground flex items-center gap-1"
						title="Stop session"
					>
						<LuSquare className="size-3" />
						<span className="hidden sm:inline">stop</span>
					</button>
				)}
				<button
					type="button"
					onClick={onNewChat}
					className="px-1.5 py-0.5 rounded hover:bg-muted/60 hover:text-foreground"
					title="Reset chat"
				>
					new
				</button>
			</div>
		</div>
	);
}

function ContextRing({ pct }: { pct: number }) {
	const r = 6;
	const c = 2 * Math.PI * r;
	const colorClass =
		pct < 50 ? "text-green-500" : pct < 80 ? "text-amber-500" : "text-red-500";
	return (
		<svg className="size-3.5 -rotate-90 shrink-0" viewBox="0 0 16 16">
			<title>{`Context ${pct.toFixed(0)}%`}</title>
			<circle
				cx="8"
				cy="8"
				r={r}
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				className="opacity-20"
			/>
			<circle
				cx="8"
				cy="8"
				r={r}
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeDasharray={`${(pct / 100) * c} ${c}`}
				className={colorClass}
			/>
		</svg>
	);
}

function PillSeparator() {
	return (
		<span className="text-border/60 select-none shrink-0">│</span>
	);
}

function PillSelect({
	value,
	onValueChange,
	options,
	label,
}: {
	value: string;
	onValueChange: (v: string) => void;
	options: { value: string; label: string; short: string }[];
	label: string;
}) {
	const current = options.find((o) => o.value === value) ?? options[0];
	return (
		<Select value={value} onValueChange={onValueChange}>
			<SelectTrigger className="h-6 px-2 text-[11px] font-mono border-0 bg-transparent hover:bg-muted/60 rounded-md gap-1 [&>svg]:size-3 [&>svg]:opacity-50 w-auto shrink-0">
				<span className="flex items-center gap-1">
					<span className="opacity-60 hidden sm:inline">{label}:</span>
					<span>{current.short}</span>
				</span>
			</SelectTrigger>
			<SelectContent>
				{options.map((o) => (
					<SelectItem key={o.value} value={o.value} className="text-xs">
						{o.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

function TurnView({
	turn,
	onApprove,
	onAnswerQuestion,
}: {
	turn: Turn;
	onApprove: (id: string, decision: "allow" | "deny") => void;
	onAnswerQuestion: (id: string, answer: string) => void;
}) {
	switch (turn.kind) {
		case "user":
			return (
				<div className="flex justify-end">
					<div className="max-w-[80%] rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-4 py-2 text-sm whitespace-pre-wrap">
						{turn.text}
					</div>
				</div>
			);
		case "assistant":
			return (
				<div className="text-sm prose prose-sm dark:prose-invert max-w-none">
					<Streamdown>{turn.text}</Streamdown>
				</div>
			);
		case "thinking":
			return <ThinkingBlock text={turn.text} />;
		case "tool":
			return <ToolBlock turn={turn} />;
		case "approval":
			if (turn.toolName === "AskUserQuestion") {
				return (
					<AskUserQuestionPicker
						turn={turn}
						onAnswerQuestion={onAnswerQuestion}
					/>
				);
			}
			return <ApprovalBlock turn={turn} onApprove={onApprove} />;
		default:
			return null;
	}
}

function ThinkingBlock({ text }: { text: string }) {
	const [open, setOpen] = useState(false);
	return (
		<div className="text-xs text-muted-foreground border-l-2 border-amber-500/30 pl-3">
			<button
				type="button"
				onClick={() => setOpen(!open)}
				className="flex items-center gap-1 hover:text-foreground"
			>
				{open ? (
					<HiOutlineChevronDown className="size-3" />
				) : (
					<HiOutlineChevronRight className="size-3" />
				)}
				<span className="italic">Thinking</span>
			</button>
			{open && (
				<div className="mt-1 whitespace-pre-wrap text-[11px] opacity-80">
					{text}
				</div>
			)}
		</div>
	);
}

function ToolBlock({
	turn,
}: {
	turn: Extract<Turn, { kind: "tool" }>;
}) {
	const [open, setOpen] = useState(false);
	const inputStr = useMemo(
		() => JSON.stringify(turn.input, null, 2),
		[turn.input],
	);
	return (
		<div className="rounded-md border border-border bg-muted/20 text-xs">
			<button
				type="button"
				onClick={() => setOpen(!open)}
				className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-muted/40"
			>
				{open ? (
					<HiOutlineChevronDown className="size-3" />
				) : (
					<HiOutlineChevronRight className="size-3" />
				)}
				<HiOutlineWrenchScrewdriver className="size-3 text-muted-foreground" />
				<span className="font-mono">{turn.name}</span>
				{turn.resultText !== undefined && (
					<span
						className={`ml-auto text-[10px] ${turn.isError ? "text-destructive" : "text-green-500"}`}
					>
						{turn.isError ? "error" : "ok"}
					</span>
				)}
			</button>
			{open && (
				<div className="px-2 pb-2 space-y-1.5">
					<pre className="font-mono text-[10px] whitespace-pre-wrap text-muted-foreground">
						{inputStr}
					</pre>
					{turn.resultText !== undefined && (
						<pre
							className={`font-mono text-[10px] whitespace-pre-wrap pt-1.5 border-t border-border ${turn.isError ? "text-destructive" : ""}`}
						>
							{turn.resultText.length > 4000
								? `${turn.resultText.slice(0, 4000)}\n…(truncated, ${turn.resultText.length} chars total)`
								: turn.resultText}
						</pre>
					)}
				</div>
			)}
		</div>
	);
}

interface AskUserQuestionOption {
	label: string;
	description?: string;
}

interface AskUserQuestionItem {
	question: string;
	header?: string;
	options: AskUserQuestionOption[];
	multiSelect?: boolean;
}

function AskUserQuestionPicker({
	turn,
	onAnswerQuestion,
}: {
	turn: Extract<Turn, { kind: "approval" }>;
	onAnswerQuestion: (id: string, answer: string) => void;
}) {
	const questions: AskUserQuestionItem[] = useMemo(() => {
		const raw = (turn.input as { questions?: unknown }).questions;
		return Array.isArray(raw) ? (raw as AskUserQuestionItem[]) : [];
	}, [turn.input]);
	const [picked, setPicked] = useState<Record<number, Set<string>>>({});
	const [customText, setCustomText] = useState<Record<number, string>>({});

	const toggle = (qIdx: number, label: string, multi: boolean) => {
		setPicked((prev) => {
			const next = { ...prev };
			const current = new Set(prev[qIdx] ?? []);
			if (multi) {
				if (current.has(label)) current.delete(label);
				else current.add(label);
			} else {
				current.clear();
				current.add(label);
			}
			next[qIdx] = current;
			return next;
		});
	};

	const canSubmit = questions.every((q, i) => {
		const selected = picked[i]?.size ?? 0;
		const text = customText[i]?.trim();
		return selected > 0 || !!text;
	});

	const submit = () => {
		if (turn.resolved) return;
		const lines: string[] = [];
		questions.forEach((q, i) => {
			const selected = Array.from(picked[i] ?? []);
			const text = customText[i]?.trim();
			const answer =
				selected.length > 0 && text
					? `${selected.join(", ")} — additional note: ${text}`
					: selected.length > 0
						? selected.join(", ")
						: (text ?? "(no answer)");
			lines.push(`Q${i + 1}: ${q.question}`);
			lines.push(`A${i + 1}: ${answer}`);
			lines.push("");
		});
		onAnswerQuestion(turn.approvalId, lines.join("\n").trimEnd());
	};

	if (questions.length === 0) {
		return (
			<div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs italic text-muted-foreground">
				Unable to parse AskUserQuestion input.
			</div>
		);
	}

	return (
		<div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 space-y-3">
			<div className="flex items-center gap-2 text-xs font-medium text-amber-600">
				<HiOutlineSparkles className="size-3.5" />
				Claude is asking
			</div>
			{questions.map((q, qIdx) => {
				const multi = q.multiSelect === true;
				const current = picked[qIdx] ?? new Set<string>();
				return (
					<div key={qIdx} className="space-y-2">
						{q.header && (
							<div className="text-[10px] uppercase tracking-wide text-muted-foreground">
								{q.header}
							</div>
						)}
						<div className="text-sm font-medium">{q.question}</div>
						<div className="space-y-1">
							{q.options.map((opt) => {
								const active = current.has(opt.label);
								return (
									<button
										type="button"
										key={opt.label}
										disabled={!!turn.resolved}
										onClick={() => toggle(qIdx, opt.label, multi)}
										className={`w-full text-left rounded-md border px-2 py-1.5 text-xs transition-colors ${
											active
												? "border-amber-500 bg-amber-500/20"
												: "border-border hover:bg-muted/40"
										} disabled:opacity-50`}
									>
										<div className="flex items-center gap-2">
											<span
												className={`inline-block size-3 shrink-0 rounded-full border ${
													active
														? "bg-amber-500 border-amber-500"
														: "border-border"
												}`}
											/>
											<span className="font-medium">{opt.label}</span>
										</div>
										{opt.description && (
											<div className="mt-0.5 ml-5 text-[11px] text-muted-foreground leading-snug">
												{opt.description}
											</div>
										)}
									</button>
								);
							})}
						</div>
						<textarea
							value={customText[qIdx] ?? ""}
							onChange={(e) =>
								setCustomText((prev) => ({ ...prev, [qIdx]: e.target.value }))
							}
							placeholder="Or type your own answer…"
							rows={1}
							disabled={!!turn.resolved}
							className="w-full text-xs bg-background border border-border rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
						/>
					</div>
				);
			})}
			{turn.resolved ? (
				<div className="text-[11px] italic text-muted-foreground">
					✓ Answered.
				</div>
			) : (
				<div className="flex justify-end">
					<Button
						size="sm"
						disabled={!canSubmit}
						onClick={submit}
						className="h-7 text-xs"
					>
						Send answer
					</Button>
				</div>
			)}
		</div>
	);
}

function ApprovalBlock({
	turn,
	onApprove,
}: {
	turn: Extract<Turn, { kind: "approval" }>;
	onApprove: (id: string, decision: "allow" | "deny") => void;
}) {
	return (
		<div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
			<div className="flex items-center gap-2 text-xs font-medium text-amber-600">
				<HiOutlineWrenchScrewdriver className="size-3.5" />
				Permission requested: <span className="font-mono">{turn.toolName}</span>
			</div>
			<pre className="font-mono text-[10px] whitespace-pre-wrap text-muted-foreground">
				{JSON.stringify(turn.input, null, 2)}
			</pre>
			{turn.resolved ? (
				<div className="text-[11px] italic text-muted-foreground">
					{turn.resolved === "allow" ? "✓ Allowed." : "✗ Denied."}
				</div>
			) : (
				<div className="flex gap-2">
					<Button
						size="sm"
						variant="outline"
						onClick={() => onApprove(turn.approvalId, "allow")}
						className="h-7 text-xs"
					>
						Allow
					</Button>
					<Button
						size="sm"
						variant="outline"
						onClick={() => onApprove(turn.approvalId, "deny")}
						className="h-7 text-xs"
					>
						Deny
					</Button>
				</div>
			)}
		</div>
	);
}
