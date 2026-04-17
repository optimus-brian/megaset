import type { Issue } from "@superset/git-provider-core";
import { IssueColumn } from "./components/IssueColumn";

const COLUMNS = [
	{ state: "open" as const, label: "Open" },
	{ state: "in_progress" as const, label: "In Progress" },
	{ state: "closed" as const, label: "Closed" },
] as const;

interface IssuesKanbanBoardProps {
	issues: Issue[];
}

export function IssuesKanbanBoard({ issues }: IssuesKanbanBoardProps) {
	const byState = COLUMNS.map((col) => ({
		...col,
		items: issues.filter((i) => i.state === col.state),
	}));

	return (
		<div className="flex flex-1 gap-4 p-4 overflow-x-auto">
			{byState.map((col) => (
				<IssueColumn
					key={col.state}
					label={col.label}
					state={col.state}
					items={col.items}
				/>
			))}
		</div>
	);
}
