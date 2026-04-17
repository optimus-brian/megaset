import type { Issue } from "@superset/git-provider-core";
import { Spinner } from "@superset/ui/spinner";
import { cn } from "@superset/ui/utils";
import { electronTrpc } from "renderer/lib/electron-trpc";

interface SubIssuesListProps {
	projectId: string;
	parentNumber: number;
	onIssueClick?: (issue: Issue) => void;
}

function stateDot(state: Issue["state"]) {
	return cn(
		"inline-block size-2 rounded-full shrink-0",
		state === "closed"
			? "bg-muted-foreground"
			: state === "in_progress"
				? "bg-yellow-500"
				: "bg-green-500",
	);
}

export function SubIssuesList({
	projectId,
	parentNumber,
	onIssueClick,
}: SubIssuesListProps) {
	const { data, isLoading } =
		electronTrpc.gitProviders.listSubIssuesForProject.useQuery({
			projectId,
			number: parentNumber,
		});

	if (isLoading) {
		return (
			<div className="flex items-center justify-center py-2">
				<Spinner className="size-3" />
			</div>
		);
	}

	const subIssues = data?.subIssues ?? [];
	if (subIssues.length === 0) {
		return (
			<p className="text-[10px] text-muted-foreground px-1 py-1">
				No sub-issues.
			</p>
		);
	}

	return (
		<ul className="space-y-1 pl-2 border-l border-border ml-1">
			{subIssues.map((sub) => {
				const isInteractive = !!onIssueClick;
				const classes = cn(
					"flex items-center gap-2 text-xs rounded px-1.5 py-1 w-full text-left",
					"hover:bg-muted/50 transition-colors",
					sub.state === "closed" && "text-muted-foreground line-through",
				);
				const inner = (
					<>
						<span className={stateDot(sub.state)} />
						<span className="text-[10px] font-mono text-muted-foreground shrink-0">
							#{sub.number}
						</span>
						<span className="truncate">{sub.title}</span>
					</>
				);
				if (isInteractive) {
					return (
						<li key={sub.id}>
							<button
								type="button"
								onClick={() => onIssueClick(sub)}
								className={classes}
							>
								{inner}
							</button>
						</li>
					);
				}
				return (
					<li key={sub.id}>
						<a
							href={sub.url}
							target="_blank"
							rel="noopener noreferrer"
							className={classes}
						>
							{inner}
						</a>
					</li>
				);
			})}
		</ul>
	);
}
