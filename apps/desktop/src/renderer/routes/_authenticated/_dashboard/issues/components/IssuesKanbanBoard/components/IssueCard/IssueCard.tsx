import type { Issue } from "@superset/git-provider-core";

interface IssueCardProps {
	issue: Issue;
}

export function IssueCard({ issue }: IssueCardProps) {
	return (
		<a
			href={issue.url}
			target="_blank"
			rel="noopener noreferrer"
			className="block p-3 bg-background border border-border rounded-md hover:border-muted-foreground transition-colors"
		>
			<div className="flex items-start justify-between gap-2">
				<span className="text-xs text-muted-foreground">#{issue.number}</span>
				<span className="text-[10px] uppercase tracking-wide text-muted-foreground">
					{issue.provider}
				</span>
			</div>
			<h4 className="text-sm font-medium line-clamp-2 mt-1">{issue.title}</h4>
			{issue.labels.length > 0 && (
				<div className="flex flex-wrap gap-1 mt-2">
					{issue.labels.slice(0, 4).map((label) => (
						<span
							key={label}
							className="text-[10px] px-1.5 py-0.5 bg-muted text-muted-foreground rounded"
						>
							{label}
						</span>
					))}
				</div>
			)}
		</a>
	);
}
