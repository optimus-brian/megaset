import { Button } from "@superset/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { toast } from "@superset/ui/sonner";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	HiOutlineArrowTopRightOnSquare,
	HiOutlineChevronDown,
	HiOutlineChevronRight,
	HiOutlineEye,
	HiOutlineFolderOpen,
	HiOutlinePaperClip,
	HiOutlineSparkles,
	HiOutlineWrenchScrewdriver,
	HiOutlineXMark,
} from "react-icons/hi2";
import { LuSquare } from "react-icons/lu";
import { useClaudeSdkPendingLaunchStore } from "fork/claude-sdk/renderer/pending-launch";
import {
	type StatusBarVisibility,
	useClaudeSdkSettingsStore,
} from "fork/claude-sdk/settings-store";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTabsStore } from "renderer/stores/tabs/store";
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

interface Attachment {
	id: string;
	mediaType: string;
	dataUrl: string;
	name: string;
}

function readFileAsDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = () => reject(reader.error ?? new Error("read failed"));
		reader.readAsDataURL(file);
	});
}

function stripDataUrlPrefix(dataUrl: string): string {
	const comma = dataUrl.indexOf(",");
	return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

/**
 * Extract a file path from a Claude Agent SDK tool invocation so the UI can
 * offer "open / reveal" actions. Returns null if the tool has no file arg.
 */
function extractFilePath(
	toolName: string,
	input: unknown,
): string | null {
	if (!input || typeof input !== "object") return null;
	const o = input as Record<string, unknown>;
	const pick = (...keys: string[]): string | null => {
		for (const k of keys) {
			const v = o[k];
			if (typeof v === "string" && v.trim().length > 0) return v;
		}
		return null;
	};
	switch (toolName) {
		case "Read":
		case "Write":
		case "Edit":
		case "MultiEdit":
			return pick("file_path", "filePath", "path");
		case "NotebookEdit":
		case "NotebookRead":
			return pick("notebook_path", "notebookPath", "file_path");
		case "LS":
		case "Glob":
		case "Grep":
			return pick("path");
		default:
			return null;
	}
}

function resolveAbsolutePath(
	filePath: string,
	cwd: string | undefined,
): string {
	if (filePath.startsWith("/") || /^[A-Za-z]:[\\/]/.test(filePath)) {
		return filePath;
	}
	if (filePath.startsWith("~/") && typeof cwd === "string") {
		// Best-effort; main process resolves ~ via shell.openPath too.
		return filePath;
	}
	if (!cwd) return filePath;
	const sep = cwd.endsWith("/") ? "" : "/";
	return `${cwd}${sep}${filePath}`;
}

function isPathWithinCwd(absolutePath: string, cwd: string | undefined): boolean {
	if (!cwd) return false;
	const normalizedCwd = cwd.endsWith("/") ? cwd.slice(0, -1) : cwd;
	return (
		absolutePath === normalizedCwd ||
		absolutePath.startsWith(`${normalizedCwd}/`)
	);
}

// Resume-session persistence is handled by the main process via the
// `claudeSdk.getResumeId` / `claudeSdk.setResumeId` tRPC endpoints. File-backed
// storage there writes synchronously on every change — unlike Chromium's
// localStorage which flushes lazily and loses pending writes when the app is
// killed (e.g. during app updates).

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
	const [resumeHydrated, setResumeHydrated] = useState(false);
	const resumeIdQuery = electronTrpc.claudeSdk.getResumeId.useQuery({ paneId });
	const setResumeIdMutation = electronTrpc.claudeSdk.setResumeId.useMutation();
	const [turns, setTurns] = useState<Turn[]>([]);
	const [input, setInput] = useState("");
	const [attachments, setAttachments] = useState<Attachment[]>([]);
	const [dragOver, setDragOver] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);
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
	const updatePermissionMode =
		electronTrpc.claudeSdk.setPermissionMode.useMutation();

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

	useEffect(() => {
		if (resumeHydrated) return;
		if (resumeIdQuery.data) {
			const loaded = resumeIdQuery.data.resumeSessionId;
			if (loaded) setResumeSessionId(loaded);
			setResumeHydrated(true);
		}
	}, [resumeHydrated, resumeIdQuery.data]);

	useEffect(() => {
		if (!resumeHydrated) return;
		setResumeIdMutation.mutate({ paneId, resumeSessionId });
	}, [paneId, resumeSessionId, resumeHydrated, setResumeIdMutation]);

	const addFiles = useCallback(async (files: File[]) => {
		const images = files.filter((f) => f.type.startsWith("image/"));
		if (images.length === 0) {
			if (files.length > 0)
				toast.error("Only image files are supported right now.");
			return;
		}
		const loaded = await Promise.all(
			images.map(async (file) => ({
				id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
				mediaType: file.type,
				dataUrl: await readFileAsDataUrl(file),
				name: file.name,
			})),
		);
		setAttachments((prev) => [...prev, ...loaded]);
	}, []);

	const removeAttachment = (id: string) => {
		setAttachments((prev) => prev.filter((a) => a.id !== id));
	};

	const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
		const items = e.clipboardData?.items;
		if (!items) return;
		const files: File[] = [];
		for (const item of items) {
			if (item.kind === "file") {
				const f = item.getAsFile();
				if (f) files.push(f);
			}
		}
		if (files.length > 0) {
			e.preventDefault();
			void addFiles(files);
		}
	};

	const handleDragOver = (e: React.DragEvent) => {
		if (e.dataTransfer.types.includes("Files")) {
			e.preventDefault();
			e.dataTransfer.dropEffect = "copy";
			setDragOver(true);
		}
	};

	const handleDragLeave = (e: React.DragEvent) => {
		if (e.currentTarget === e.target) setDragOver(false);
	};

	const handleDrop = (e: React.DragEvent) => {
		if (!e.dataTransfer.types.includes("Files")) return;
		e.preventDefault();
		e.stopPropagation();
		setDragOver(false);
		const files = Array.from(e.dataTransfer.files);
		if (files.length > 0) void addFiles(files);
	};

	const handleSend = async () => {
		const text = input.trim();
		const hasAttachments = attachments.length > 0;
		if ((!text && !hasAttachments) || !cwd) return;
		const snapshot = attachments;
		setInput("");
		setAttachments([]);
		const displayText = hasAttachments
			? text
				? `${text}\n\n[${snapshot.length} image${snapshot.length > 1 ? "s" : ""} attached]`
				: `[${snapshot.length} image${snapshot.length > 1 ? "s" : ""} attached]`
			: text;
		setTurns((prev) => [...prev, { kind: "user", text: displayText }]);
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
			await sendMessage.mutateAsync({
				sessionId: sid,
				text,
				...(hasAttachments
					? {
							attachments: snapshot.map((a) => ({
								mediaType: a.mediaType,
								data: stripDataUrlPrefix(a.dataUrl),
							})),
						}
					: {}),
			});
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

	// AskUserQuestion: feed answers back via the documented `allow + updatedInput`
	// shape — `{ questions, answers: { [questionText]: label } }`. The SDK's
	// built-in tool recognizes this and returns it as the tool result without
	// trying to prompt the user itself.
	// Docs: https://code.claude.com/docs/en/agent-sdk/user-input#return-answers-to-claude
	const handleAnswerQuestion = (
		approvalId: string,
		toolInput: Record<string, unknown>,
		answersByQuestion: Record<string, string>,
	) => {
		if (!sessionId) return;
		const questions = (toolInput as { questions?: unknown }).questions;
		approveTool.mutate({
			sessionId,
			approvalId,
			decision: {
				behavior: "allow",
				updatedInput: {
					questions,
					answers: answersByQuestion,
				},
			},
		});
	};

	const addFileViewerPane = useTabsStore((s) => s.addFileViewerPane);
	const openInFinder = electronTrpc.external.openInFinder.useMutation();
	const openFileInEditor =
		electronTrpc.external.openFileInEditor.useMutation();
	const trpcUtils = electronTrpc.useUtils();

	const fileActions = useMemo(
		() => ({
			openInViewer: async (filePath: string) => {
				// Expand ~/ and relative paths via the main process so we get a real
				// absolute path. Tilde resolution can't happen in the renderer since
				// it has no access to os.homedir().
				let abs: string;
				try {
					abs = await trpcUtils.external.resolvePath.fetch({
						path: filePath,
						...(cwd ? { cwd } : {}),
					});
				} catch {
					abs = resolveAbsolutePath(filePath, cwd);
				}

				// The inline file viewer reads through workspace-fs, which is restricted
				// to the workspace root (memory files, ~/.claude/..., or sibling repos
				// all sit outside). Fall back to the user's configured editor in that
				// case so the preview button still does something useful.
				if (isPathWithinCwd(abs, cwd)) {
					addFileViewerPane(workspaceId, { filePath: abs });
					return;
				}

				openFileInEditor.mutate(
					{ path: abs, ...(cwd ? { cwd } : {}) },
					{
						onError: (err) =>
							toast.error(`Open failed: ${err.message ?? "unknown"}`),
					},
				);
			},
			openInEditor: (filePath: string) => {
				const abs = resolveAbsolutePath(filePath, cwd);
				openFileInEditor.mutate(
					{ path: abs, ...(cwd ? { cwd } : {}) },
					{
						onError: (err) =>
							toast.error(`Open failed: ${err.message ?? "unknown"}`),
					},
				);
			},
			revealInFinder: (filePath: string) => {
				const abs = resolveAbsolutePath(filePath, cwd);
				openInFinder.mutate(abs, {
					onError: (err) =>
						toast.error(`Reveal failed: ${err.message ?? "unknown"}`),
				});
			},
		}),
		[
			addFileViewerPane,
			workspaceId,
			cwd,
			openFileInEditor,
			openInFinder,
			trpcUtils,
		],
	);

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
		if (sessionId) {
			updatePermissionMode.mutate({
				sessionId,
				mode: v as
					| "default"
					| "acceptEdits"
					| "bypassPermissions"
					| "plan",
			});
		}
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
			<div ref={scrollRef} className="flex-1 overflow-y-auto select-text">
				<div className="p-4 space-y-4">
					{turns.length === 0 && (
						<div className="text-center text-xs text-muted-foreground py-12">
							<HiOutlineSparkles className="size-8 mx-auto mb-2 opacity-30" />
							{resumeSessionId ? (
								<>
									<p>Resuming previous session on next message.</p>
									<p
										className="mt-1 opacity-60 font-mono truncate max-w-xs mx-auto"
										title={resumeSessionId}
									>
										{resumeSessionId.slice(0, 8)}…
									</p>
								</>
							) : (
								<p>Send a message to start a Claude session.</p>
							)}
							<p className="mt-1 opacity-60 font-mono">{formatPath(cwd) || "—"}</p>
						</div>
					)}
					{turns.map((turn, idx) => (
						<TurnView
							key={idx}
							turn={turn}
							onApprove={handleApprove}
							onAnswerQuestion={handleAnswerQuestion}
							fileActions={fileActions}
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
			<div
				className={`border-t border-border p-3 transition-colors ${
					dragOver
						? "bg-primary/10 ring-1 ring-primary/40"
						: "bg-muted/10"
				}`}
				onDragOver={handleDragOver}
				onDragLeave={handleDragLeave}
				onDrop={handleDrop}
			>
				{attachments.length > 0 && (
					<div className="flex flex-wrap gap-2 mb-2">
						{attachments.map((a) => (
							<div
								key={a.id}
								className="relative group rounded-md border border-border bg-background overflow-hidden"
								title={a.name}
							>
								<img
									src={a.dataUrl}
									alt={a.name}
									className="size-14 object-cover"
								/>
								<button
									type="button"
									onClick={() => removeAttachment(a.id)}
									aria-label={`Remove ${a.name}`}
									className="absolute top-0.5 right-0.5 size-4 rounded-full bg-background/80 text-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-destructive hover:text-destructive-foreground transition"
								>
									<HiOutlineXMark className="size-3" />
								</button>
							</div>
						))}
					</div>
				)}
				<input
					ref={fileInputRef}
					type="file"
					accept="image/*"
					multiple
					className="hidden"
					onChange={(e) => {
						const files = e.target.files ? Array.from(e.target.files) : [];
						if (files.length > 0) void addFiles(files);
						e.target.value = "";
					}}
				/>
				<div className="flex gap-2 items-end">
					<Button
						size="sm"
						variant="ghost"
						onClick={() => fileInputRef.current?.click()}
						disabled={!cwd}
						title="Attach image"
						className="shrink-0 h-9 px-2"
					>
						<HiOutlinePaperClip className="size-4" />
					</Button>
					<textarea
						value={input}
						onChange={(e) => setInput(e.target.value)}
						onPaste={handlePaste}
						placeholder={
							dragOver
								? "Drop images here…"
								: "Message Claude…  (⌘+Enter to send, paste or drop images)"
						}
						rows={2}
						disabled={!cwd}
						className="flex-1 text-sm bg-background border border-border rounded-md px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 field-sizing-content min-h-[3.75rem] max-h-[60vh] overflow-y-auto"
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
						disabled={(!input.trim() && attachments.length === 0) || !cwd}
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

interface FileActions {
	openInViewer: (filePath: string) => void | Promise<void>;
	openInEditor: (filePath: string) => void;
	revealInFinder: (filePath: string) => void;
}

function TurnView({
	turn,
	onApprove,
	onAnswerQuestion,
	fileActions,
}: {
	turn: Turn;
	onApprove: (id: string, decision: "allow" | "deny") => void;
	onAnswerQuestion: (
		id: string,
		toolInput: Record<string, unknown>,
		answersByQuestion: Record<string, string>,
	) => void;
	fileActions: FileActions;
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
					<Streamdown
						components={{
							a: (props) => <AssistantLink {...props} fileActions={fileActions} />,
							code: (props) => <AssistantCode {...props} fileActions={fileActions} />,
						}}
					>
						{turn.text}
					</Streamdown>
				</div>
			);
		case "thinking":
			return <ThinkingBlock text={turn.text} />;
		case "tool":
			return <ToolBlock turn={turn} fileActions={fileActions} />;
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

function AssistantLink({
	href,
	children,
	fileActions,
	...rest
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
	fileActions: FileActions;
}) {
	const openUrl = electronTrpc.external.openUrl.useMutation();
	const isFile =
		typeof href === "string" &&
		(href.startsWith("file://") ||
			href.startsWith("/") ||
			href.startsWith("~/"));
	if (isFile && href) {
		const path = href.startsWith("file://")
			? decodeURIComponent(href.slice("file://".length))
			: href;
		const onClick = (e: React.MouseEvent) => {
			e.preventDefault();
			// Shift-click = reveal in Finder; Cmd/Ctrl-click = open in system editor;
			// plain click = inline viewer pane.
			if (e.shiftKey) fileActions.revealInFinder(path);
			else if (e.metaKey || e.ctrlKey) fileActions.openInEditor(path);
			else fileActions.openInViewer(path);
		};
		return (
			<button
				type="button"
				onClick={onClick}
				className="text-primary underline decoration-dotted underline-offset-2 hover:decoration-solid"
				title="Click: viewer · ⌘-click: editor · ⇧-click: Finder"
			>
				{children}
			</button>
		);
	}
	return (
		<a
			{...rest}
			href={href}
			target="_blank"
			rel="noopener noreferrer"
			onClick={(e) => {
				if (href && /^https?:\/\//.test(href)) {
					e.preventDefault();
					openUrl.mutate(href);
				}
			}}
		>
			{children}
		</a>
	);
}

const PATH_LIKE_RE =
	/^~?[\w./-]*\/[\w./-]+\.[a-zA-Z0-9]{1,8}$|^\/[\w./-]+$|^~\/[\w./-]+$/;

/**
 * Detect whether an inline-code span looks like a file/directory path.
 * Matches absolute paths (`/Users/...`), home paths (`~/...`), and
 * relative paths with an extension (`foo/bar.md`).
 */
function looksLikePath(text: string): boolean {
	if (!text || text.length > 300) return false;
	if (/\s/.test(text)) return false;
	return PATH_LIKE_RE.test(text);
}

function AssistantCode({
	className,
	children,
	fileActions,
	inline,
	...rest
}: React.HTMLAttributes<HTMLElement> & {
	fileActions: FileActions;
	inline?: boolean;
}) {
	const text =
		typeof children === "string"
			? children
			: Array.isArray(children) &&
					children.every((c) => typeof c === "string")
				? children.join("")
				: null;

	// Only linkify single-line inline code (no <pre> block context).
	const isBlock = className?.includes("language-") ?? false;
	if (!isBlock && text && looksLikePath(text)) {
		const onClick = (e: React.MouseEvent) => {
			e.preventDefault();
			if (e.shiftKey) fileActions.revealInFinder(text);
			else if (e.metaKey || e.ctrlKey) fileActions.openInEditor(text);
			else fileActions.openInViewer(text);
		};
		return (
			<button
				type="button"
				onClick={onClick}
				className={`${className ?? ""} cursor-pointer underline decoration-dotted underline-offset-2 hover:decoration-solid`}
				title="Click: viewer · ⌘-click: editor · ⇧-click: Finder"
			>
				{children}
			</button>
		);
	}
	return (
		<code className={className} {...rest}>
			{children}
		</code>
	);
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
	fileActions,
}: {
	turn: Extract<Turn, { kind: "tool" }>;
	fileActions: FileActions;
}) {
	const [open, setOpen] = useState(false);
	const inputStr = useMemo(
		() => JSON.stringify(turn.input, null, 2),
		[turn.input],
	);
	const filePath = useMemo(
		() => extractFilePath(turn.name, turn.input),
		[turn.name, turn.input],
	);
	const canViewFile =
		filePath &&
		["Read", "Write", "Edit", "MultiEdit", "NotebookEdit", "NotebookRead"].includes(
			turn.name,
		);
	const fileLabel = filePath ? formatPath(filePath) : null;

	return (
		<div className="rounded-md border border-border bg-muted/20 text-xs">
			<div className="flex items-center gap-1 px-2 py-1.5 hover:bg-muted/40">
				<button
					type="button"
					onClick={() => setOpen(!open)}
					className="flex items-center gap-2 min-w-0 flex-1 text-left"
				>
					{open ? (
						<HiOutlineChevronDown className="size-3 shrink-0" />
					) : (
						<HiOutlineChevronRight className="size-3 shrink-0" />
					)}
					<HiOutlineWrenchScrewdriver className="size-3 text-muted-foreground shrink-0" />
					<span className="font-mono shrink-0">{turn.name}</span>
					{fileLabel && (
						<span
							className="font-mono text-muted-foreground truncate"
							title={filePath ?? undefined}
						>
							{fileLabel}
						</span>
					)}
				</button>
				{filePath && (
					<div className="flex items-center gap-0.5 shrink-0">
						{canViewFile && (
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation();
									fileActions.openInViewer(filePath);
								}}
								className="p-1 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground"
								title="Open in viewer pane"
								aria-label={`Open ${filePath} in viewer`}
							>
								<HiOutlineEye className="size-3" />
							</button>
						)}
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								fileActions.openInEditor(filePath);
							}}
							className="p-1 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground"
							title="Open with default editor/app"
							aria-label={`Open ${filePath} with default editor`}
						>
							<HiOutlineArrowTopRightOnSquare className="size-3" />
						</button>
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								fileActions.revealInFinder(filePath);
							}}
							className="p-1 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground"
							title="Reveal in Finder"
							aria-label={`Reveal ${filePath} in Finder`}
						>
							<HiOutlineFolderOpen className="size-3" />
						</button>
					</div>
				)}
				{turn.resultText !== undefined && (
					<span
						className={`ml-1 text-[10px] shrink-0 ${turn.isError ? "text-destructive" : "text-green-500"}`}
					>
						{turn.isError ? "error" : "ok"}
					</span>
				)}
			</div>
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
	onAnswerQuestion: (
		id: string,
		toolInput: Record<string, unknown>,
		answersByQuestion: Record<string, string>,
	) => void;
}) {
	const questions: AskUserQuestionItem[] = useMemo(() => {
		const raw = (turn.input as { questions?: unknown }).questions;
		return Array.isArray(raw) ? (raw as AskUserQuestionItem[]) : [];
	}, [turn.input]);
	const [picked, setPicked] = useState<Record<number, Set<string>>>({});
	const [customText, setCustomText] = useState<Record<number, string>>({});
	const [activeIdx, setActiveIdx] = useState(0);
	const autoAdvanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Refs mirror the latest state so deferred callbacks (setTimeout, kbd
	// handler) never read stale closures — same trick as t3code's
	// `onAdvanceRef.current()` in ComposerPendingUserInputPanel.tsx.
	const pickedRef = useRef(picked);
	const customTextRef = useRef(customText);
	const activeIdxRef = useRef(activeIdx);
	useEffect(() => {
		pickedRef.current = picked;
	}, [picked]);
	useEffect(() => {
		customTextRef.current = customText;
	}, [customText]);
	useEffect(() => {
		activeIdxRef.current = activeIdx;
	}, [activeIdx]);

	const activeQuestion = questions[activeIdx];
	const isMulti = activeQuestion?.multiSelect === true;
	const activePicked = picked[activeIdx] ?? new Set<string>();
	const activeCustom = customText[activeIdx] ?? "";

	useEffect(
		() => () => {
			if (autoAdvanceRef.current !== null) {
				clearTimeout(autoAdvanceRef.current);
			}
		},
		[],
	);

	const submitAll = useCallback(() => {
		if (turn.resolved) return;
		// AskUserQuestionOutput expects `answers: { [questionText]: string }`.
		// Multi-select answers are comma-separated per the SDK contract.
		const latestPicked = pickedRef.current;
		const latestText = customTextRef.current;
		const answers: Record<string, string> = {};
		questions.forEach((q, i) => {
			const selected = Array.from(latestPicked[i] ?? []);
			const text = latestText[i]?.trim();
			const value =
				selected.length > 0 && text
					? `${selected.join(", ")} — ${text}`
					: selected.length > 0
						? selected.join(", ")
						: (text ?? "");
			answers[q.question] = value;
		});
		onAnswerQuestion(
			turn.approvalId,
			turn.input as Record<string, unknown>,
			answers,
		);
	}, [onAnswerQuestion, questions, turn.approvalId, turn.input, turn.resolved]);

	const advance = useCallback(() => {
		if (activeIdxRef.current + 1 >= questions.length) {
			submitAll();
			return;
		}
		setActiveIdx((i) => i + 1);
	}, [questions.length, submitAll]);

	const advanceRef = useRef(advance);
	useEffect(() => {
		advanceRef.current = advance;
	}, [advance]);

	const toggleOption = useCallback(
		(label: string) => {
			if (turn.resolved) return;
			setPicked((prev) => {
				const next = { ...prev };
				const current = new Set(prev[activeIdx] ?? []);
				if (isMulti) {
					if (current.has(label)) current.delete(label);
					else current.add(label);
				} else {
					current.clear();
					current.add(label);
				}
				next[activeIdx] = current;
				return next;
			});

			if (!isMulti) {
				if (autoAdvanceRef.current !== null) {
					clearTimeout(autoAdvanceRef.current);
				}
				autoAdvanceRef.current = setTimeout(() => {
					autoAdvanceRef.current = null;
					advanceRef.current();
				}, 200);
			}
		},
		[activeIdx, isMulti, turn.resolved],
	);

	// Number keys 1–9 select the corresponding option, Enter advances (used when
	// multi-select or when the user wants to move on with a custom-text answer).
	useEffect(() => {
		if (!activeQuestion || turn.resolved) return;
		const handler = (event: KeyboardEvent) => {
			if (event.metaKey || event.ctrlKey || event.altKey) return;
			const target = event.target;
			if (
				target instanceof HTMLInputElement ||
				target instanceof HTMLTextAreaElement
			) {
				return;
			}
			if (event.key === "Enter") {
				const hasAnswer =
					(picked[activeIdx]?.size ?? 0) > 0 ||
					(customText[activeIdx]?.trim().length ?? 0) > 0;
				if (!hasAnswer) return;
				event.preventDefault();
				advance();
				return;
			}
			const digit = Number.parseInt(event.key, 10);
			if (Number.isNaN(digit) || digit < 1 || digit > 9) return;
			const optionIndex = digit - 1;
			const option = activeQuestion.options[optionIndex];
			if (!option) return;
			event.preventDefault();
			toggleOption(option.label);
		};
		document.addEventListener("keydown", handler);
		return () => document.removeEventListener("keydown", handler);
	}, [
		activeIdx,
		activeQuestion,
		advance,
		customText,
		picked,
		toggleOption,
		turn.resolved,
	]);

	if (questions.length === 0) {
		return (
			<div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs italic text-muted-foreground">
				Unable to parse AskUserQuestion input.
			</div>
		);
	}

	if (!activeQuestion) {
		return null;
	}

	const hasAnswer =
		activePicked.size > 0 || activeCustom.trim().length > 0;
	const isLast = activeIdx + 1 >= questions.length;

	return (
		<div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 space-y-3">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2 text-xs font-medium text-amber-600">
					<HiOutlineSparkles className="size-3.5" />
					Claude is asking
				</div>
				{questions.length > 1 && (
					<span className="rounded-md bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground/70">
						{activeIdx + 1}/{questions.length}
					</span>
				)}
			</div>
			<div className="space-y-2">
				{activeQuestion.header && (
					<div className="text-[10px] uppercase tracking-wide text-muted-foreground/60">
						{activeQuestion.header}
					</div>
				)}
				<div className="text-sm font-medium">{activeQuestion.question}</div>
				{isMulti && (
					<p className="text-[11px] text-muted-foreground/70">
						Select one or more. Press <kbd className="rounded bg-muted/60 px-1 font-mono">Enter</kbd> when done.
					</p>
				)}
				<div className="space-y-1">
					{activeQuestion.options.map((opt, index) => {
						const active = activePicked.has(opt.label);
						const shortcut = index < 9 ? index + 1 : null;
						return (
							<button
								type="button"
								key={opt.label}
								disabled={!!turn.resolved}
								onClick={() => toggleOption(opt.label)}
								className={`group flex w-full items-center gap-2.5 rounded-md border px-2.5 py-1.5 text-left transition-all ${
									active
										? "border-amber-500/70 bg-amber-500/15"
										: "border-transparent bg-muted/20 hover:bg-muted/40 hover:border-border/40"
								} disabled:opacity-50 disabled:cursor-not-allowed`}
							>
								{shortcut !== null && (
									<kbd
										className={`flex size-5 shrink-0 items-center justify-center rounded font-mono text-[11px] tabular-nums transition-colors ${
											active
												? "bg-amber-500/25 text-amber-500"
												: "bg-muted/50 text-muted-foreground/60 group-hover:bg-muted/70 group-hover:text-muted-foreground/80"
										}`}
									>
										{shortcut}
									</kbd>
								)}
								<div className="min-w-0 flex-1">
									<span className="text-sm font-medium">{opt.label}</span>
									{opt.description && opt.description !== opt.label && (
										<span className="ml-2 text-[11px] text-muted-foreground/60">
											{opt.description}
										</span>
									)}
								</div>
								{active && (
									<span className="text-amber-500 text-xs shrink-0">✓</span>
								)}
							</button>
						);
					})}
				</div>
				<textarea
					value={activeCustom}
					onChange={(e) =>
						setCustomText((prev) => ({ ...prev, [activeIdx]: e.target.value }))
					}
					onKeyDown={(e) => {
						if (
							(e.metaKey || e.ctrlKey) &&
							e.key === "Enter" &&
							hasAnswer &&
							!turn.resolved
						) {
							e.preventDefault();
							advance();
						}
					}}
					placeholder="Or type your own answer… (⌘+Enter to send)"
					rows={1}
					disabled={!!turn.resolved}
					className="w-full text-xs bg-background border border-border rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
				/>
			</div>
			{turn.resolved ? (
				<div className="text-[11px] italic text-muted-foreground">
					✓ Answered.
				</div>
			) : (
				(isMulti || activeCustom.trim().length > 0) && (
					<div className="flex justify-end">
						<Button
							size="sm"
							disabled={!hasAnswer}
							onClick={advance}
							className="h-7 text-xs"
						>
							{isLast ? "Send answer" : "Next"}
						</Button>
					</div>
				)
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
