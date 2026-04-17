import { useDroppable } from "@dnd-kit/core";
import type { Issue } from "@superset/git-provider-core";
import { cn } from "@superset/ui/utils";
import { IssueCard } from "../IssueCard";

interface IssueColumnProps {
	label: string;
	state: Issue["state"];
	items: Issue[];
	onIssueClick?: (issue: Issue) => void;
	activeIssueId?: string;
	droppableId: string;
	projectId?: string;
}

export function IssueColumn({
	label,
	state,
	items,
	onIssueClick,
	activeIssueId,
	droppableId,
	projectId,
}: IssueColumnProps) {
	const { setNodeRef, isOver } = useDroppable({
		id: droppableId,
		data: { category: state },
	});
	return (
		<div
			ref={setNodeRef}
			data-state={state}
			className={cn(
				"flex-1 min-w-[260px] max-w-[340px] flex flex-col bg-muted/30 rounded-md self-start transition-colors",
				isOver && "bg-primary/10 ring-1 ring-primary/30",
			)}
		>
			<div className="px-3 py-2 flex items-center justify-between border-b border-border">
				<span className="text-sm font-medium">{label}</span>
				<span className="text-xs text-muted-foreground">{items.length}</span>
			</div>
			<div className="p-2 space-y-2">
				{items.length === 0 ? (
					<p className="text-xs text-muted-foreground text-center py-4">
						No issues
					</p>
				) : (
					items.map((issue) => (
						<IssueCard
							key={issue.id}
							issue={issue}
							onIssueClick={onIssueClick}
							isActive={issue.id === activeIssueId}
							projectId={projectId}
						/>
					))
				)}
			</div>
		</div>
	);
}
