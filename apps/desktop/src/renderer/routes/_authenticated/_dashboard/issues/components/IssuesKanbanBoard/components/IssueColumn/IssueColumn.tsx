import type { Issue } from "@superset/git-provider-core";
import { IssueCard } from "../IssueCard";

interface IssueColumnProps {
	label: string;
	state: Issue["state"];
	items: Issue[];
}

export function IssueColumn({ label, state, items }: IssueColumnProps) {
	return (
		<div
			data-state={state}
			className="flex-1 min-w-[280px] max-w-[340px] flex flex-col bg-muted/30 rounded-md"
		>
			<div className="px-3 py-2 flex items-center justify-between border-b border-border">
				<span className="text-sm font-medium">{label}</span>
				<span className="text-xs text-muted-foreground">{items.length}</span>
			</div>
			<div className="flex-1 overflow-y-auto p-2 space-y-2">
				{items.length === 0 ? (
					<p className="text-xs text-muted-foreground text-center py-6">
						No issues
					</p>
				) : (
					items.map((issue) => <IssueCard key={issue.id} issue={issue} />)
				)}
			</div>
		</div>
	);
}
