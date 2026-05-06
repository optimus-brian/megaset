import type { Issue } from "@superset/git-provider-core";
import type { AgentLaunchRequest } from "@superset/shared/agent-launch";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { openClaudeSdkTabWithPrompt } from "fork/claude-sdk/renderer/pending-launch";
import { useClaudeSdkSettingsStore } from "fork/claude-sdk/settings-store";
import { useMemo, useState } from "react";
import { HiOutlineSparkles, HiXMark } from "react-icons/hi2";
import { AgentSelect } from "renderer/components/AgentSelect";
import { useLinkedIssue } from "renderer/hooks/useLinkedIssue";
import { launchAgentSession } from "renderer/lib/agent-session-orchestrator";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useCreateWorkspace } from "renderer/react-query/workspaces";
import { buildTaskAgentLaunchRequest } from "shared/utils/agent-launch-request";
import {
	type AgentDefinitionId,
	getEnabledAgentConfigs,
	indexResolvedAgentConfigs,
} from "shared/utils/agent-settings";
import { sanitizeSegment } from "shared/utils/branch";

type WorkspaceMode = "main" | "worktree";
type AgentChoice = AgentDefinitionId | "none" | "claude-sdk";

const CLAUDE_SDK_AGENT_VALUE = "claude-sdk" as const;

interface ClaudeSdkPromptComment {
	author: string;
	body: string;
	createdAt: string | number | Date;
}

function buildClaudeSdkPrompt(
	issue: Issue,
	comments: ClaudeSdkPromptComment[] = [],
): string {
	const parts: string[] = [
		`# Issue #${issue.number}: ${issue.title}`,
		"",
		`Provider: ${issue.provider}`,
		`URL: ${issue.url}`,
		`State: ${issue.state}`,
	];
	if (issue.labels.length > 0) {
		parts.push(`Labels: ${issue.labels.join(", ")}`);
	}
	parts.push("");
	if (issue.body && issue.body.trim()) {
		parts.push("## Description", issue.body.trim());
		parts.push("");
	}
	if (comments.length > 0) {
		parts.push(`## Comments (${comments.length})`);
		for (const c of comments) {
			const when = new Date(c.createdAt).toISOString().slice(0, 10);
			parts.push("", `**${c.author}** _(${when})_`, "", c.body);
		}
		parts.push("");
	}
	parts.push(
		"Plan the work for this issue first: inspect the code, outline the changes needed, and present the plan before editing anything.",
	);
	return parts.join("\n");
}

interface IssueDetailSidebarProps {
	issue: Issue;
	projectId: string;
	onClose: () => void;
}

export function IssueDetailSidebar({
	issue,
	projectId,
	onClose,
}: IssueDetailSidebarProps) {
	const navigate = useNavigate();
	const createWorkspace = useCreateWorkspace();
	const openMain = electronTrpc.workspaces.openMainRepoWorkspace.useMutation();
	const terminalCreateOrAttach =
		electronTrpc.terminal.createOrAttach.useMutation();
	const terminalWrite = electronTrpc.terminal.write.useMutation();
	const postComment =
		electronTrpc.gitProviders.createIssueCommentForProject.useMutation();
	const addLabels =
		electronTrpc.gitProviders.addIssueLabelsForProject.useMutation();
	const { link: linkIssue } = useLinkedIssue(null);
	const utils = electronTrpc.useUtils();
	const setIssueState =
		electronTrpc.gitProviders.setIssueStateForProject.useMutation({
			onSuccess: () =>
				utils.gitProviders.listIssuesForProject.invalidate({ projectId }),
			onError: (err) => toast.error(`Status update failed: ${err.message}`),
		});

	const handleStatusChange = (next: Issue["state"]) => {
		if (next === issue.state) return;
		setIssueState.mutate({
			projectId,
			number: issue.number,
			targetState: next,
		});
	};

	const defaultSlug = `${issue.provider}-${issue.number}`;
	const defaultTitleSegment = sanitizeSegment(issue.title, 40);
	const defaultBranch = defaultTitleSegment
		? `${defaultSlug}-${defaultTitleSegment}`
		: defaultSlug;

	const [mode, setMode] = useState<WorkspaceMode>("worktree");
	const [name, setName] = useState(defaultSlug);
	const [branch, setBranch] = useState(defaultBranch);

	const agentPresetsQuery = electronTrpc.settings.getAgentPresets.useQuery();
	const agentPresets = agentPresetsQuery.data ?? [];
	const enabledAgents = useMemo(
		() => getEnabledAgentConfigs(agentPresets),
		[agentPresets],
	);
	const agentConfigsById = useMemo(
		() => indexResolvedAgentConfigs(agentPresets),
		[agentPresets],
	);
	const claudeSdkEnabled = useClaudeSdkSettingsStore((s) => s.enabled);
	const defaultAgent = useMemo<AgentChoice>(() => {
		if (claudeSdkEnabled) return CLAUDE_SDK_AGENT_VALUE;
		if (enabledAgents.some((a) => a.id === "claude")) return "claude";
		return enabledAgents[0]?.id ?? "none";
	}, [enabledAgents, claudeSdkEnabled]);
	const [agent, setAgent] = useState<AgentChoice | null>(null);
	const [newComment, setNewComment] = useState("");
	const effectiveAgent: AgentChoice = agent ?? defaultAgent;

	const commentsQuery =
		electronTrpc.gitProviders.listIssueCommentsForProject.useQuery(
			{ projectId, number: issue.number },
			{ refetchInterval: 10_000, refetchIntervalInBackground: true },
		);
	const comments = commentsQuery.data?.comments ?? [];

	const handleSubmitComment = async () => {
		const body = newComment.trim();
		if (!body) return;
		try {
			await postComment.mutateAsync({
				projectId,
				number: issue.number,
				body,
			});
			setNewComment("");
			utils.gitProviders.listIssueCommentsForProject.invalidate({
				projectId,
				number: issue.number,
			});
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to post comment",
			);
		}
	};

	const isPending = createWorkspace.isPending || openMain.isPending;

	const buildLaunchRequest = (workspaceId: string) => {
		if (effectiveAgent === "none" || effectiveAgent === CLAUDE_SDK_AGENT_VALUE)
			return undefined;
		const bodyParts: string[] = [];
		if (issue.body && issue.body.trim()) bodyParts.push(issue.body.trim());
		if (comments.length > 0) {
			bodyParts.push("## Comments");
			for (const c of comments) {
				const when = new Date(c.createdAt).toISOString().slice(0, 10);
				bodyParts.push(`**${c.author}** _(${when})_\n\n${c.body}`);
			}
		}
		const description = bodyParts.join("\n\n---\n\n");
		return (
			buildTaskAgentLaunchRequest({
				task: {
					id: defaultSlug,
					slug: defaultSlug,
					title: issue.title,
					description,
					priority: "",
					statusName: issue.state,
					labels: issue.labels,
				},
				workspaceId,
				selectedAgent: effectiveAgent,
				source: "open-in-workspace",
				autoRun: true,
				configsById: agentConfigsById,
			}) ?? undefined
		);
	};

	const runAgent = async (workspaceId: string) => {
		const launchRequest = buildLaunchRequest(workspaceId);
		if (!launchRequest) return;
		const withId: AgentLaunchRequest = { ...launchRequest, workspaceId };
		const result = await launchAgentSession(withId, {
			source: "open-in-workspace",
			createOrAttach: (input) => terminalCreateOrAttach.mutateAsync(input),
			write: (input) => terminalWrite.mutateAsync(input),
		});
		if (result.status === "failed") {
			throw new Error(result.error ?? "Agent launch failed");
		}
	};

	const postWorkspaceComment = async (workspaceName: string) => {
		try {
			await postComment.mutateAsync({
				projectId,
				number: issue.number,
				body: `Workspace **${workspaceName}** opened in Superset${
					effectiveAgent !== "none" && effectiveAgent !== CLAUDE_SDK_AGENT_VALUE
					? ` with agent \`${effectiveAgent}\``
					: effectiveAgent === CLAUDE_SDK_AGENT_VALUE
					? " with Claude SDK"
					: ""
				}.`,
			});
			utils.gitProviders.listIssueCommentsForProject.invalidate({
				projectId,
				number: issue.number,
			});
		} catch (err) {
			console.warn("[IssueDetailSidebar] Failed to post issue comment:", err);
		}
	};

	const markIssueInProgress = async () => {
		if (issue.state === "in_progress" || issue.state === "closed") return;
		try {
			await addLabels.mutateAsync({
				projectId,
				number: issue.number,
				labels: ["in progress"],
			});
			utils.gitProviders.listIssuesForProject.invalidate({ projectId });
		} catch (err) {
			console.warn("[IssueDetailSidebar] Failed to set in-progress label:", err);
		}
	};

	const handleAction = async () => {
		if (mode === "main") {
			try {
				const result = await openMain.mutateAsync({ projectId });
				if (effectiveAgent !== "none") {
					await runAgent(result.workspace.id);
				}
				linkIssue(result.workspace.id, {
				projectId,
				issueNumber: issue.number,
				issueTitle: issue.title,
				issueUrl: issue.url,
			});
			await postWorkspaceComment(result.workspace.name);
			await markIssueInProgress();
				if (effectiveAgent === CLAUDE_SDK_AGENT_VALUE) {
					openClaudeSdkTabWithPrompt(
						result.workspace.id,
						buildClaudeSdkPrompt(issue, comments),
						{ permissionMode: "plan" },
					);
				}
				toast.success(
					result.wasExisting ? "Opened main workspace" : "Main workspace ready",
				);
				onClose();
				navigate({
					to: "/workspace/$workspaceId",
					params: { workspaceId: result.workspace.id },
				});
			} catch (err) {
				toast.error(
					err instanceof Error ? err.message : "Failed to open main workspace",
				);
			}
			return;
		}

		if (!name.trim() || !branch.trim()) {
			toast.error("Name and branch are required");
			return;
		}
		try {
			const launchRequest = buildLaunchRequest("pending-workspace");
			const result = await createWorkspace.mutateAsyncWithPendingSetup(
				{
					projectId,
					name: name.trim(),
					branchName: branch.trim(),
				},
				launchRequest ? { agentLaunchRequest: launchRequest } : undefined,
			);
			// PendingSetup handles agent launch on fresh workspaces; for existing ones
			// (wasExisting=true) we launch manually so the agent opens every time.
			if (result.wasExisting && effectiveAgent !== "none") {
				await runAgent(result.workspace.id);
			}
			linkIssue(result.workspace.id, {
				projectId,
				issueNumber: issue.number,
				issueTitle: issue.title,
				issueUrl: issue.url,
			});
			await postWorkspaceComment(result.workspace.name);
			await markIssueInProgress();
			if (effectiveAgent === CLAUDE_SDK_AGENT_VALUE) {
				openClaudeSdkTabWithPrompt(
					result.workspace.id,
					buildClaudeSdkPrompt(issue, comments),
					{ permissionMode: "plan" },
				);
			}
			toast.success(
				result.wasExisting
					? `Opened workspace ${result.workspace.name}`
					: `Created workspace ${result.workspace.name}`,
			);
			onClose();
			navigate({
				to: "/workspace/$workspaceId",
				params: { workspaceId: result.workspace.id },
			});
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to create workspace",
			);
		}
	};

	return (
		<aside className="w-[360px] shrink-0 border-l border-border flex flex-col overflow-hidden">
			<div className="flex items-center justify-between px-3 py-2 border-b border-border">
				<div className="flex items-center gap-2 min-w-0">
					<span className="text-xs font-mono text-muted-foreground">
						#{issue.number}
					</span>
					<span className="text-[10px] uppercase tracking-wide text-muted-foreground">
						{issue.provider}
					</span>
				</div>
				<button
					type="button"
					onClick={onClose}
					className="p-1 text-muted-foreground hover:text-foreground"
					aria-label="Close"
				>
					<HiXMark className="size-4" />
				</button>
			</div>

			<div className="shrink-0 overflow-y-auto max-h-[55%] p-4 space-y-4 border-b border-border">
				<div>
					<h3 className="text-sm font-semibold leading-snug">{issue.title}</h3>
					<a
						href={issue.url}
						target="_blank"
						rel="noopener noreferrer"
						className="text-xs text-muted-foreground hover:underline mt-1 inline-block"
					>
						Open on {issue.provider}
					</a>
				</div>

				<div>
					<span className="text-xs text-muted-foreground block mb-1">
						Status
					</span>
					<div className="flex rounded-md border border-border overflow-hidden text-xs">
						{(
							[
								{ value: "open", label: "Open" },
								{ value: "in_progress", label: "In Progress" },
								{ value: "closed", label: "Closed" },
							] as const
						).map((opt) => (
							<button
								key={opt.value}
								type="button"
								disabled={setIssueState.isPending}
								onClick={() => handleStatusChange(opt.value)}
								className={`flex-1 px-2 py-1.5 ${
									issue.state === opt.value
										? "bg-accent text-foreground"
										: "text-muted-foreground hover:bg-accent/30"
								} disabled:opacity-50`}
							>
								{opt.label}
							</button>
						))}
					</div>
				</div>

				{issue.labels.length > 0 && (
					<div className="flex flex-wrap gap-1">
						{issue.labels.map((label) => (
							<span
								key={label}
								className="text-[10px] px-1.5 py-0.5 bg-muted text-muted-foreground rounded"
							>
								{label}
							</span>
						))}
					</div>
				)}

				{issue.body && (
					<div className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto border border-border rounded-md p-2 bg-muted/30">
						{issue.body}
					</div>
				)}

				<div className="space-y-3 pt-2 border-t border-border">
					<div className="flex rounded-md border border-border overflow-hidden text-xs">
						<button
							type="button"
							onClick={() => setMode("worktree")}
							className={`flex-1 px-2 py-1.5 ${
								mode === "worktree"
									? "bg-accent text-foreground"
									: "text-muted-foreground hover:bg-accent/30"
							}`}
						>
							New worktree
						</button>
						<button
							type="button"
							onClick={() => setMode("main")}
							className={`flex-1 px-2 py-1.5 ${
								mode === "main"
									? "bg-accent text-foreground"
									: "text-muted-foreground hover:bg-accent/30"
							}`}
						>
							Main repo
						</button>
					</div>

					{mode === "worktree" && (
						<>
							<div className="space-y-1">
								<label
									htmlFor="ws-name"
									className="text-xs text-muted-foreground block"
								>
									Workspace name
								</label>
								<input
									id="ws-name"
									value={name}
									onChange={(e) => setName(e.target.value)}
									className="w-full text-sm bg-background border border-border rounded px-2 py-1"
								/>
							</div>
							<div className="space-y-1">
								<label
									htmlFor="ws-branch"
									className="text-xs text-muted-foreground block"
								>
									Branch name
								</label>
								<input
									id="ws-branch"
									value={branch}
									onChange={(e) => setBranch(e.target.value)}
									className="w-full text-sm bg-background border border-border rounded px-2 py-1 font-mono"
								/>
							</div>
						</>
					)}

					<div className="space-y-1">
						<span className="text-xs text-muted-foreground block">Agent</span>
						<AgentSelect<AgentChoice>
							agents={enabledAgents}
							value={effectiveAgent}
							placeholder="No agent"
							onValueChange={setAgent}
							allowNone
							noneLabel="No agent"
							noneValue="none"
							disabled={!agentPresetsQuery.isFetched}
							triggerClassName="w-full h-8 text-xs"
							extraOptions={
								claudeSdkEnabled
									? [
											{
												value: CLAUDE_SDK_AGENT_VALUE,
												label: "Claude SDK (in-app)",
												icon: (
													<HiOutlineSparkles className="size-3.5 text-amber-500" />
												),
											},
										]
									: []
							}
						/>
					</div>

					<Button
						size="sm"
						className="w-full"
						disabled={isPending}
						onClick={handleAction}
					>
						{isPending
							? mode === "main"
								? "Opening…"
								: "Creating…"
							: mode === "main"
								? "Open in main repo"
								: "Create worktree"}
					</Button>
				</div>
			</div>

			<div className="flex-1 flex flex-col min-h-0">
				<div className="shrink-0 px-4 pt-3 pb-2 border-b border-border">
					<h4 className="text-xs font-semibold">
						Comments{" "}
						<span className="text-muted-foreground font-normal">
							({comments.length})
						</span>
					</h4>
				</div>

				<div className="flex-1 overflow-y-auto px-4 py-3">
					{commentsQuery.isLoading ? (
						<p className="text-xs text-muted-foreground">Loading…</p>
					) : comments.length === 0 ? (
						<p className="text-xs text-muted-foreground">No comments yet.</p>
					) : (
						<ul className="space-y-2">
							{comments.map((c) => (
								<li
									key={c.id}
									className="text-xs rounded-md border border-border p-2 bg-muted/20"
								>
									<div className="flex items-center gap-2 mb-1">
										{c.authorAvatarUrl && (
											<img
												src={c.authorAvatarUrl}
												alt=""
												className="size-4 rounded-full"
											/>
										)}
										<span className="font-medium">{c.author}</span>
										<span className="text-muted-foreground">
											{new Date(c.createdAt).toLocaleDateString()}
										</span>
									</div>
									<div className="whitespace-pre-wrap text-muted-foreground leading-relaxed">
										{c.body}
									</div>
								</li>
							))}
						</ul>
					)}
				</div>

				<div className="shrink-0 border-t border-border p-3 space-y-2 bg-background">
					<textarea
						value={newComment}
						onChange={(e) => setNewComment(e.target.value)}
						placeholder="Write a comment…"
						rows={2}
						className="w-full text-xs bg-background border border-border rounded px-2 py-1.5 resize-y leading-relaxed focus:outline-none focus:ring-1 focus:ring-ring"
						disabled={postComment.isPending}
						onKeyDown={(e) => {
							if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
								e.preventDefault();
								handleSubmitComment();
							}
						}}
					/>
					<div className="flex justify-end">
						<Button
							size="sm"
							variant="outline"
							disabled={postComment.isPending || !newComment.trim()}
							onClick={handleSubmitComment}
						>
							{postComment.isPending ? "Posting…" : "Comment"}
						</Button>
					</div>
				</div>
			</div>
		</aside>
	);
}
