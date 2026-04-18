import {
	DndContext,
	type DragEndEvent,
	MouseSensor,
	TouchSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import type { Issue, IssueState } from "@superset/git-provider-core";
import { IssueColumn } from "./components/IssueColumn";

const DEFAULT_STATES: IssueState[] = [
	{ id: "open", name: "Open", category: "open" },
	{ id: "in_progress", name: "In Progress", category: "in_progress" },
	{ id: "closed", name: "Closed", category: "closed" },
];

interface IssuesKanbanBoardProps {
	issues: Issue[];
	onIssueClick?: (issue: Issue) => void;
	activeIssueId?: string;
	onStateChange?: (issue: Issue, newCategory: Issue["state"]) => void;
	boardId: string;
	projectId?: string;
	states?: IssueState[];
	/**
	 * Optional filter: only columns whose category is in this set are rendered.
	 * Undefined or empty set = show all columns.
	 */
	visibleCategories?: Set<Issue["state"]>;
}

export function IssuesKanbanBoard({
	issues,
	onIssueClick,
	activeIssueId,
	onStateChange,
	boardId,
	projectId,
	states,
	visibleCategories,
}: IssuesKanbanBoardProps) {
	// Top-level only: sub-issues are rendered nested under their parent card.
	const topLevel = issues.filter((i) => i.parentIssueNumber == null);
	const baseStates = states && states.length > 0 ? states : DEFAULT_STATES;
	const effectiveStates =
		visibleCategories && visibleCategories.size > 0
			? baseStates.filter((s) => visibleCategories.has(s.category))
			: baseStates;
	const columns = effectiveStates.map((s) => ({
		state: s,
		items: topLevel.filter((i) =>
			i.stateId ? i.stateId === s.id : i.state === s.category,
		),
	}));

	// Activate drag after small movement threshold so clicks still work.
	const sensors = useSensors(
		useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
		useSensor(TouchSensor, {
			activationConstraint: { delay: 150, tolerance: 5 },
		}),
	);

	const handleDragEnd = (event: DragEndEvent) => {
		if (!onStateChange) return;
		const targetCategory = event.over?.data.current?.category as
			| Issue["state"]
			| undefined;
		const issue = event.active.data.current?.issue as Issue | undefined;
		if (!issue || !targetCategory || issue.state === targetCategory) return;
		onStateChange(issue, targetCategory);
	};

	return (
		<DndContext sensors={sensors} onDragEnd={handleDragEnd}>
			<div className="flex gap-3 overflow-x-auto items-start">
				{columns.map((col) => (
					<IssueColumn
						key={col.state.id}
						label={col.state.name}
						state={col.state.category}
						items={col.items}
						onIssueClick={onIssueClick}
						activeIssueId={activeIssueId}
						droppableId={`${boardId}:${col.state.id}`}
						projectId={projectId}
					/>
				))}
			</div>
		</DndContext>
	);
}
