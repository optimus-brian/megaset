import { Button } from "@superset/ui/button";
import { Spinner } from "@superset/ui/spinner";
import { toast } from "@superset/ui/sonner";
import { useState } from "react";
import { useLinkedIssue } from "renderer/hooks/useLinkedIssue";
import { electronTrpc } from "renderer/lib/electron-trpc";

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

	const issue = issueQuery.data?.issue;
	const provider = issueQuery.data?.provider;
	const comments = commentsQuery.data?.comments ?? [];

	const handleSubmit = () => {
		if (!draft.trim()) return;
		postComment.mutate({
			projectId,
			number: issueNumber,
			body: draft.trim(),
		});
	};

	if (issueQuery.isLoading) {
		return (
			<div className="flex-1 flex items-center justify-center">
				<Spinner className="size-4" />
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
		<div className="flex-1 min-h-0 flex flex-col">
			<div className="px-3 py-2 border-b border-border flex items-center gap-2">
				<span className="text-xs font-mono text-muted-foreground">
					#{issue.number}
				</span>
				{provider && (
					<span className="text-[10px] uppercase tracking-wide text-muted-foreground">
						{provider}
					</span>
				)}
				<button
					type="button"
					onClick={onUnlink}
					className="ml-auto text-[10px] text-muted-foreground hover:text-foreground"
				>
					Unlink
				</button>
			</div>

			<div className="flex-1 overflow-y-auto p-3 space-y-4">
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
					<div className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed border border-border rounded-md p-2 bg-muted/30">
						{issue.body}
					</div>
				)}

				<div>
					<h4 className="text-xs font-semibold mb-2">
						Comments{" "}
						<span className="text-muted-foreground font-normal">
							({comments.length})
						</span>
					</h4>
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
			</div>

			<div className="shrink-0 border-t border-border p-2 space-y-2">
				<textarea
					placeholder="Write a comment…"
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					className="w-full min-h-[60px] text-xs bg-background border border-border rounded px-2 py-1 resize-y"
					onKeyDown={(e) => {
						if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
							handleSubmit();
						}
					}}
				/>
				<div className="flex items-center justify-between">
					<span className="text-[10px] text-muted-foreground">
						⌘ + Enter to post
					</span>
					<Button
						size="sm"
						disabled={!draft.trim() || postComment.isPending}
						onClick={handleSubmit}
					>
						{postComment.isPending ? "Posting…" : "Post comment"}
					</Button>
				</div>
			</div>
		</div>
	);
}
