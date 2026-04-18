import type { Issue } from "@superset/git-provider-core";
import { Button } from "@superset/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { Skeleton } from "@superset/ui/skeleton";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { HiPaperAirplane } from "react-icons/hi2";
import { LuExternalLink } from "react-icons/lu";
import { VscChevronRight, VscIssues } from "react-icons/vsc";
import { useLinkedIssue } from "renderer/hooks/useLinkedIssue";
import { electronTrpc } from "renderer/lib/electron-trpc";

function stateColor(state: Issue["state"]): string {
	switch (state) {
		case "open":
			return "text-green-500";
		case "in_progress":
			return "text-blue-500";
		default:
			return "text-muted-foreground";
	}
}

const STATE_OPTIONS: { value: Issue["state"]; label: string }[] = [
	{ value: "open", label: "Open" },
	{ value: "in_progress", label: "In Progress" },
	{ value: "closed", label: "Closed" },
];

interface LinkedIssueViewProps {
	workspaceId: string;
}

export function LinkedIssueView({ workspaceId }: LinkedIssueViewProps) {
	const { issue: linked, unlink } = useLinkedIssue(workspaceId);

	if (!linked) {
		return (
			<div className="flex-1 flex items-center justify-center p-4">
				<p className="text-sm text-muted-foreground text-center">
					No issue linked to this workspace.
				</p>
			</div>
		);
	}

	return (
		<LinkedIssueContent
			workspaceId={workspaceId}
			projectId={linked.projectId}
			issueNumber={linked.issueNumber}
			onUnlink={() => unlink(workspaceId)}
		/>
	);
}

interface LinkedIssueContentProps {
	workspaceId: string;
	projectId: string;
	issueNumber: number;
	onUnlink: () => void;
}

function LinkedIssueContent({
	projectId,
	issueNumber,
	onUnlink,
}: LinkedIssueContentProps) {
	const utils = electronTrpc.useUtils();
	const issueQuery = electronTrpc.gitProviders.getIssueForProject.useQuery(
		{ projectId, number: issueNumber },
		{ refetchInterval: 60_000 },
	);
	const commentsQuery =
		electronTrpc.gitProviders.listIssueCommentsForProject.useQuery(
			{ projectId, number: issueNumber },
			{ refetchInterval: 30_000 },
		);

	const [draft, setDraft] = useState("");
	const [descOpen, setDescOpen] = useState(false);

	const postComment =
		electronTrpc.gitProviders.createIssueCommentForProject.useMutation({
			onSuccess: () => {
				setDraft("");
				utils.gitProviders.listIssueCommentsForProject.invalidate({
					projectId,
					number: issueNumber,
				});
			},
			onError: (err) => toast.error(`Failed to post: ${err.message}`),
		});

	const setState =
		electronTrpc.gitProviders.setIssueStateForProject.useMutation({
			onSuccess: () =>
				utils.gitProviders.getIssueForProject.invalidate({
					projectId,
					number: issueNumber,
				}),
			onError: (err) => toast.error(`Status update failed: ${err.message}`),
		});

	const issue = issueQuery.data?.issue;
	const provider = issueQuery.data?.provider;
	const comments = commentsQuery.data?.comments ?? [];

	const handleSubmit = () => {
		const body = draft.trim();
		if (!body) return;
		postComment.mutate({ projectId, number: issueNumber, body });
	};

	if (issueQuery.isLoading) {
		return (
			<div className="flex flex-col flex-1 min-h-0 p-3 space-y-2">
				<Skeleton className="h-5 w-24 rounded-sm" />
				<Skeleton className="h-4 w-full rounded-sm" />
				<Skeleton className="h-4 w-3/4 rounded-sm" />
				<Skeleton className="h-20 w-full rounded-sm" />
			</div>
		);
	}

	if (!issue) {
		return (
			<div className="flex-1 flex items-center justify-center p-4">
				<p className="text-sm text-muted-foreground text-center">
					Issue #{issueNumber} could not be loaded.
				</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col flex-1 min-h-0">
			{/* Header */}
			<div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
				<div className="flex items-center gap-2 min-w-0">
					<VscIssues
						className={`size-3.5 shrink-0 ${stateColor(issue.state)}`}
					/>
					<span className="text-xs font-mono text-muted-foreground truncate">
						#{issue.number}
					</span>
					{provider && (
						<span className="text-[10px] uppercase tracking-wide text-muted-foreground">
							{provider}
						</span>
					)}
				</div>
				<div className="flex items-center gap-1 shrink-0">
					<a
						href={issue.url}
						target="_blank"
						rel="noopener noreferrer"
						className="p-1 text-muted-foreground hover:text-foreground transition-colors"
						title={`Open on ${issue.provider}`}
					>
						<LuExternalLink className="size-3.5" />
					</a>
					<button
						type="button"
						onClick={onUnlink}
						className="text-[10px] text-muted-foreground hover:text-foreground px-1"
					>
						Unlink
					</button>
				</div>
			</div>

			{/* Scrollable content */}
			<div className="flex-1 overflow-y-auto min-h-0">
				{/* Title */}
				<div className="px-3 py-2.5 border-b border-border">
					<h3 className="text-sm font-semibold leading-snug">{issue.title}</h3>
				</div>

				{/* Properties */}
				<div className="px-3 py-2.5 border-b border-border flex flex-col gap-2">
					<div className="flex items-center justify-between">
						<span className="text-xs text-muted-foreground">State</span>
						<select
							value={issue.state}
							onChange={(e) =>
								setState.mutate({
									projectId,
									number: issueNumber,
									targetState: e.target.value as Issue["state"],
								})
							}
							disabled={setState.isPending}
							className="h-6 text-xs rounded border border-border bg-transparent px-1 w-28 disabled:opacity-50"
						>
							{STATE_OPTIONS.map((opt) => (
								<option key={opt.value} value={opt.value}>
									{opt.label}
								</option>
							))}
						</select>
					</div>
					{issue.labels.length > 0 && (
						<div className="flex items-start justify-between gap-2">
							<span className="text-xs text-muted-foreground">Labels</span>
							<div className="flex flex-wrap gap-1 justify-end">
								{issue.labels.map((label) => (
									<span
										key={label}
										className="text-[10px] px-1.5 py-0.5 bg-muted text-muted-foreground rounded"
									>
										{label}
									</span>
								))}
							</div>
						</div>
					)}
				</div>

				{/* Description (collapsible) */}
				{issue.body && (
					<div className="border-b border-border">
						<Collapsible open={descOpen} onOpenChange={setDescOpen}>
							<CollapsibleTrigger className="flex items-center gap-1.5 px-3 py-2 w-full hover:bg-accent/30 cursor-pointer transition-colors">
								<VscChevronRight
									className={cn(
										"size-3 text-muted-foreground shrink-0 transition-transform duration-150",
										descOpen && "rotate-90",
									)}
								/>
								<span className="text-xs font-medium">Description</span>
							</CollapsibleTrigger>
							<CollapsibleContent>
								<p className="px-3 pb-2.5 text-xs text-muted-foreground whitespace-pre-wrap break-words leading-relaxed">
									{issue.body}
								</p>
							</CollapsibleContent>
						</Collapsible>
					</div>
				)}

				{/* Activity */}
				<div className="px-3 py-2.5">
					<h4 className="text-xs font-medium text-muted-foreground mb-2">
						Activity{" "}
						<span className="font-normal">({comments.length})</span>
					</h4>

					{commentsQuery.isLoading ? (
						<p className="text-xs text-muted-foreground">Loading…</p>
					) : comments.length === 0 ? (
						<p className="text-xs text-muted-foreground">No activity yet.</p>
					) : (
						<ul className="space-y-3">
							{comments.map((c) => (
								<li key={c.id} className="flex items-start gap-2">
									{c.authorAvatarUrl ? (
										<img
											src={c.authorAvatarUrl}
											alt=""
											className="size-5 rounded-full shrink-0 mt-0.5"
										/>
									) : (
										<div className="size-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium shrink-0 mt-0.5">
											{c.author.slice(0, 1).toUpperCase()}
										</div>
									)}
									<div className="min-w-0 flex-1">
										<div className="flex items-center gap-2">
											<span className="text-xs font-medium">{c.author}</span>
											<span className="text-[10px] text-muted-foreground">
												{new Date(c.createdAt).toLocaleDateString()}
											</span>
										</div>
										<p className="text-xs mt-0.5 whitespace-pre-wrap break-words text-muted-foreground leading-relaxed">
											{c.body}
										</p>
									</div>
								</li>
							))}
						</ul>
					)}
				</div>
			</div>

			{/* Comment input */}
			<div className="border-t border-border px-3 py-2 shrink-0 flex gap-2">
				<textarea
					value={draft}
					onChange={(e) => {
						setDraft(e.target.value);
						e.target.style.height = "auto";
						e.target.style.height = `${Math.min(e.target.scrollHeight, 192)}px`;
					}}
					placeholder="Write a comment…"
					rows={1}
					className="flex-1 resize-none text-xs bg-transparent border border-border rounded-md px-2 py-1.5 outline-none focus:ring-1 focus:ring-ring max-h-48"
					onKeyDown={(e) => {
						if (
							e.key === "Enter" &&
							(e.metaKey || e.ctrlKey) &&
							draft.trim()
						) {
							e.preventDefault();
							handleSubmit();
						}
					}}
				/>
				<Button
					size="icon"
					className="h-7 w-7 shrink-0"
					disabled={!draft.trim() || postComment.isPending}
					onClick={handleSubmit}
					title="Post comment (⌘+Enter)"
				>
					<HiPaperAirplane className="size-3" />
				</Button>
			</div>
		</div>
	);
}
