import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { STROKE_WIDTH } from "../../constants";
import "../sidebar-entries";
import {
	type SidebarEntryPlacement,
	useSidebarEntries,
} from "../sidebar-entry-registry";

interface SidebarEntryButtonsProps {
	isCollapsed: boolean;
	placement: SidebarEntryPlacement;
}

/**
 * Renders the fork-registered sidebar nav entries for a given placement
 * (Dashboard before the upstream entries; Issues/Repos after). Kept in a
 * dedicated component so `WorkspaceSidebarHeader` stays close to upstream —
 * it just drops two `<SidebarEntryButtons />` in place of the old hardcoded
 * branches.
 */
export function SidebarEntryButtons({
	isCollapsed,
	placement,
}: SidebarEntryButtonsProps) {
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const entries = useSidebarEntries(placement);

	return (
		<>
			{entries.map((entry) => {
				if (!entry.visible) return null;
				const isActive = !!matchRoute({ to: entry.to, fuzzy: true });
				const Icon = entry.icon;

				if (isCollapsed) {
					return (
						<Tooltip key={entry.id} delayDuration={300}>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={() => navigate({ to: entry.to })}
									className={cn(
										"flex items-center justify-center size-8 rounded-md transition-colors",
										isActive
											? "text-foreground bg-accent"
											: "text-muted-foreground hover:text-foreground hover:bg-accent/50",
									)}
								>
									<Icon className="size-4" strokeWidth={STROKE_WIDTH} />
								</button>
							</TooltipTrigger>
							<TooltipContent side="right">{entry.label}</TooltipContent>
						</Tooltip>
					);
				}

				return (
					<button
						key={entry.id}
						type="button"
						onClick={() => navigate({ to: entry.to })}
						className={cn(
							"flex items-center gap-2 px-2 py-1.5 w-full rounded-md transition-colors",
							isActive
								? "text-foreground bg-accent"
								: "text-muted-foreground hover:text-foreground hover:bg-accent/50",
						)}
					>
						<div className="flex items-center justify-center size-5">
							<Icon className="size-4" strokeWidth={STROKE_WIDTH} />
						</div>
						<span className="text-sm font-medium flex-1 text-left">
							{entry.label}
						</span>
					</button>
				);
			})}
		</>
	);
}
