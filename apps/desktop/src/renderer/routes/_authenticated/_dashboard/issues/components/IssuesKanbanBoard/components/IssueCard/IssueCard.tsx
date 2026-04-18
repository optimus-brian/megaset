import { useDraggable } from "@dnd-kit/core";
import type { Issue } from "@superset/git-provider-core";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { HiChevronDown, HiChevronRight } from "react-icons/hi2";
import { SubIssuesList } from "../SubIssuesList";

interface IssueCardProps {
	issue: Issue;
	onIssueClick?: (issue: Issue) => void;
	isActive?: boolean;
	projectId?: string;
}

export function IssueCard({
	issue,
	onIssueClick,
	isActive,
	projectId,
}: IssueCardProps) {
	const { attributes, listeners, setNodeRef, transform, isDragging } =
		useDraggable({
			id: issue.id,
			data: { issue },
		});
	const [expanded, setExpanded] = useState(false);

	const dragStyle = transform
		? {
				transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
				zIndex: 50,
			}
		: undefined;

	const summary = issue.subIssuesSummary;
	const hasSubIssues = !!summary && summary.total > 0;
	const canExpand = hasSubIssues && !!projectId;

	const cardBody = (
		<>
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
			{hasSubIssues && summary && (
				<div className="mt-2 flex items-center gap-2">
					<div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
						<div
							className="h-full bg-green-500 transition-all"
							style={{
								width: `${(summary.completed / summary.total) * 100}%`,
							}}
						/>
					</div>
					<span className="text-[10px] text-muted-foreground whitespace-nowrap">
						{summary.completed}/{summary.total}
					</span>
				</div>
			)}
		</>
	);

	const classes = cn(
		"block text-left w-full p-3 bg-background border rounded-md transition-colors cursor-grab active:cursor-grabbing",
		isActive ? "border-primary" : "border-border hover:border-muted-foreground",
		isDragging && "opacity-50",
	);

	const main = onIssueClick ? (
		<button
			type="button"
			onClick={() => onIssueClick(issue)}
			ref={setNodeRef}
			style={dragStyle}
			className={classes}
			{...listeners}
			{...attributes}
		>
			{cardBody}
		</button>
	) : (
		<a
			href={issue.url}
			target="_blank"
			rel="noopener noreferrer"
			ref={setNodeRef}
			style={dragStyle}
			className={classes}
			{...listeners}
			{...attributes}
		>
			{cardBody}
		</a>
	);

	if (!canExpand) return main;

	return (
		<div className="space-y-1">
			{main}
			<button
				type="button"
				onClick={() => setExpanded((v) => !v)}
				className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground pl-1"
			>
				{expanded ? (
					<HiChevronDown className="size-3" />
				) : (
					<HiChevronRight className="size-3" />
				)}
				<span>
					{expanded ? "Hide" : "Show"} {summary?.total ?? 0} sub-issue
					{(summary?.total ?? 0) === 1 ? "" : "s"}
				</span>
			</button>
			{expanded && projectId && (
				<SubIssuesList
					projectId={projectId}
					parentNumber={issue.number}
					onIssueClick={onIssueClick}
				/>
			)}
		</div>
	);
}
