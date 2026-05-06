import type { Issue } from "@superset/git-provider-core";
import { Spinner } from "@superset/ui/spinner";
import { toast } from "@superset/ui/sonner";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { IssuesKanbanBoard } from "../IssuesKanbanBoard";

interface ProjectIssuesSectionProps {
	projectId: string;
	projectName: string;
	onIssueClick: (issue: Issue, projectId: string) => void;
	activeIssueId?: string;
	/** Optional filter — columns whose category isn't in the set are hidden. */
	visibleCategories?: Set<Issue["state"]>;
}

export function ProjectIssuesSection({
	projectId,
	projectName,
	onIssueClick,
	activeIssueId,
	visibleCategories,
}: ProjectIssuesSectionProps) {
	const utils = electronTrpc.useUtils();
	const { data, isLoading } =
		electronTrpc.gitProviders.listIssuesForProject.useQuery(
			{ projectId, state: "all" },
			{ refetchInterval: 10_000, refetchIntervalInBackground: true },
		);
	const statesQuery =
		electronTrpc.gitProviders.listIssueStatesForProject.useQuery({
			projectId,
		});

	const setState =
		electronTrpc.gitProviders.setIssueStateForProject.useMutation({
			onSuccess: () =>
				utils.gitProviders.listIssuesForProject.invalidate({ projectId }),
			onError: (err) => toast.error(`Status update failed: ${err.message}`),
		});

	const issues = data?.issues ?? [];
	const provider = data?.provider;
	const isUnsupported = !isLoading && !provider;

	const handleStateChange = (issue: Issue, newState: Issue["state"]) => {
		setState.mutate({
			projectId,
			number: issue.number,
			targetState: newState,
		});
	};

	return (
		<section className="border border-border rounded-md bg-background">
			<header className="px-4 py-2 flex items-center gap-2 border-b border-border">
				<h2 className="text-sm font-semibold">{projectName}</h2>
				{provider && (
					<span className="text-[10px] uppercase tracking-wide text-muted-foreground">
						{provider}
					</span>
				)}
				{!isLoading && provider && (
					<span className="text-xs text-muted-foreground ml-auto">
						{issues.length} {issues.length === 1 ? "issue" : "issues"}
					</span>
				)}
			</header>

			{isLoading ? (
				<div className="flex items-center justify-center py-8">
					<Spinner className="size-4" />
				</div>
			) : isUnsupported ? (
				<p className="text-xs text-muted-foreground px-4 py-3">
					No recognized git remote (GitHub / OneDev / Forgejo).
				</p>
			) : issues.length === 0 ? (
				<p className="text-xs text-muted-foreground px-4 py-3">No issues.</p>
			) : (
				<div className="px-3 py-3">
					<IssuesKanbanBoard
						boardId={projectId}
						projectId={projectId}
						issues={issues}
						onIssueClick={(issue) => onIssueClick(issue, projectId)}
						activeIssueId={activeIssueId}
						onStateChange={handleStateChange}
						states={statesQuery.data?.states}
						visibleCategories={visibleCategories}
					/>
				</div>
			)}
		</section>
	);
}
