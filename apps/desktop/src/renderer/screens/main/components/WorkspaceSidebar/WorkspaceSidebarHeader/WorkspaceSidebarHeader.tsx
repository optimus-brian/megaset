import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import {
	HiOutlineCircleStack,
	HiOutlineClipboardDocumentList,
	HiOutlineRectangleStack,
} from "react-icons/hi2";
import { LuLayers } from "react-icons/lu";
import { GATED_FEATURES, usePaywall } from "renderer/components/Paywall";
import { useModuleVisibility } from "renderer/hooks/useModuleVisibility";
import { useTasksFilterStore } from "renderer/routes/_authenticated/_dashboard/tasks/stores/tasks-filter-state";
import { STROKE_WIDTH } from "../constants";
import { NewWorkspaceButton } from "./NewWorkspaceButton";

interface WorkspaceSidebarHeaderProps {
	isCollapsed?: boolean;
}

export function WorkspaceSidebarHeader({
	isCollapsed = false,
}: WorkspaceSidebarHeaderProps) {
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const { gateFeature } = usePaywall();
	const { visibility: modules } = useModuleVisibility();

	const isWorkspacesListOpen = !!matchRoute({ to: "/workspaces" });
	const isTasksOpen = !!matchRoute({ to: "/tasks", fuzzy: true });
	const isIssuesOpen = !!matchRoute({ to: "/issues", fuzzy: true });
	const isReposOpen = !!matchRoute({ to: "/repos", fuzzy: true });

	const handleWorkspacesClick = () => {
		if (isWorkspacesListOpen) {
			// Navigate back to workspace view
			navigate({ to: "/workspace" });
		} else {
			navigate({ to: "/workspaces" });
		}
	};

	const {
		tab: lastTab,
		assignee: lastAssignee,
		search: lastSearch,
	} = useTasksFilterStore();

	const handleTasksClick = () => {
		gateFeature(GATED_FEATURES.TASKS, () => {
			const search: Record<string, string> = {};
			if (lastTab !== "all") search.tab = lastTab;
			if (lastAssignee) search.assignee = lastAssignee;
			if (lastSearch) search.search = lastSearch;
			navigate({ to: "/tasks", search });
		});
	};

	const handleIssuesClick = () => {
		navigate({ to: "/issues" });
	};

	const handleReposClick = () => {
		navigate({ to: "/repos" });
	};

	if (isCollapsed) {
		return (
			<div className="flex flex-col items-center border-b border-border py-2 gap-2">
				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={handleWorkspacesClick}
							className={cn(
								"flex items-center justify-center size-8 rounded-md transition-colors",
								isWorkspacesListOpen
									? "text-foreground bg-accent"
									: "text-muted-foreground hover:text-foreground hover:bg-accent/50",
							)}
						>
							<LuLayers className="size-4" strokeWidth={STROKE_WIDTH} />
						</button>
					</TooltipTrigger>
					<TooltipContent side="right">Workspaces</TooltipContent>
				</Tooltip>

				{modules.tasks && (
					<Tooltip delayDuration={300}>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={handleTasksClick}
								className={cn(
									"flex items-center justify-center size-8 rounded-md transition-colors",
									isTasksOpen
										? "text-foreground bg-accent"
										: "text-muted-foreground hover:text-foreground hover:bg-accent/50",
								)}
							>
								<HiOutlineClipboardDocumentList
									className="size-4"
									strokeWidth={STROKE_WIDTH}
								/>
							</button>
						</TooltipTrigger>
						<TooltipContent side="right">Tasks</TooltipContent>
					</Tooltip>
				)}

				{modules.issues && (
					<Tooltip delayDuration={300}>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={handleIssuesClick}
								className={cn(
									"flex items-center justify-center size-8 rounded-md transition-colors",
									isIssuesOpen
										? "text-foreground bg-accent"
										: "text-muted-foreground hover:text-foreground hover:bg-accent/50",
								)}
							>
								<HiOutlineRectangleStack
									className="size-4"
									strokeWidth={STROKE_WIDTH}
								/>
							</button>
						</TooltipTrigger>
						<TooltipContent side="right">Issues</TooltipContent>
					</Tooltip>
				)}

				{modules.repos && (
					<Tooltip delayDuration={300}>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={handleReposClick}
								className={cn(
									"flex items-center justify-center size-8 rounded-md transition-colors",
									isReposOpen
										? "text-foreground bg-accent"
										: "text-muted-foreground hover:text-foreground hover:bg-accent/50",
								)}
						>
							<HiOutlineCircleStack
								className="size-4"
								strokeWidth={STROKE_WIDTH}
							/>
						</button>
					</TooltipTrigger>
					<TooltipContent side="right">Repos</TooltipContent>
				</Tooltip>
				)}

				<NewWorkspaceButton isCollapsed />
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-1 border-b border-border px-2 pt-2 pb-2">
			<button
				type="button"
				onClick={handleWorkspacesClick}
				className={cn(
					"flex items-center gap-2 px-2 py-1.5 w-full rounded-md transition-colors",
					isWorkspacesListOpen
						? "text-foreground bg-accent"
						: "text-muted-foreground hover:text-foreground hover:bg-accent/50",
				)}
			>
				<div className="flex items-center justify-center size-5">
					<LuLayers className="size-4" strokeWidth={STROKE_WIDTH} />
				</div>
				<span className="text-sm font-medium flex-1 text-left">Workspaces</span>
			</button>

			{modules.tasks && (
				<button
					type="button"
					onClick={handleTasksClick}
					className={cn(
						"flex items-center gap-2 px-2 py-1.5 w-full rounded-md transition-colors",
						isTasksOpen
							? "text-foreground bg-accent"
							: "text-muted-foreground hover:text-foreground hover:bg-accent/50",
					)}
				>
					<div className="flex items-center justify-center size-5">
						<HiOutlineClipboardDocumentList
							className="size-4"
							strokeWidth={STROKE_WIDTH}
						/>
					</div>
					<span className="text-sm font-medium flex-1 text-left">Tasks</span>
				</button>
			)}

			{modules.issues && (
				<button
					type="button"
					onClick={handleIssuesClick}
					className={cn(
						"flex items-center gap-2 px-2 py-1.5 w-full rounded-md transition-colors",
						isIssuesOpen
							? "text-foreground bg-accent"
							: "text-muted-foreground hover:text-foreground hover:bg-accent/50",
					)}
				>
					<div className="flex items-center justify-center size-5">
						<HiOutlineRectangleStack
							className="size-4"
							strokeWidth={STROKE_WIDTH}
						/>
					</div>
					<span className="text-sm font-medium flex-1 text-left">Issues</span>
				</button>
			)}

			{modules.repos && (
				<button
					type="button"
					onClick={handleReposClick}
					className={cn(
						"flex items-center gap-2 px-2 py-1.5 w-full rounded-md transition-colors",
						isReposOpen
							? "text-foreground bg-accent"
							: "text-muted-foreground hover:text-foreground hover:bg-accent/50",
					)}
				>
					<div className="flex items-center justify-center size-5">
						<HiOutlineCircleStack
							className="size-4"
							strokeWidth={STROKE_WIDTH}
						/>
					</div>
					<span className="text-sm font-medium flex-1 text-left">Repos</span>
				</button>
			)}

			<NewWorkspaceButton />
		</div>
	);
}
