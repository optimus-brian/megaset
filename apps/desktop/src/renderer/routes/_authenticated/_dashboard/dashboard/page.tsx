import { createFileRoute, Link } from "@tanstack/react-router";
import type { IconType } from "react-icons";
import { VscIssues, VscListOrdered, VscRepo } from "react-icons/vsc";

export const Route = createFileRoute("/_authenticated/_dashboard/dashboard/")({
	component: DashboardPage,
});

interface DashboardLinkProps {
	to: string;
	title: string;
	description: string;
	Icon: IconType;
}

const DASHBOARD_LINKS: readonly DashboardLinkProps[] = [
	{
		to: "/issues",
		title: "Issues",
		description: "Browse and manage issues across your connected projects.",
		Icon: VscIssues,
	},
	{
		to: "/repos",
		title: "Repos",
		description: "Explore repositories and clone them as local projects.",
		Icon: VscRepo,
	},
	{
		to: "/tasks",
		title: "Tasks",
		description: "Review tasks assigned to you across providers.",
		Icon: VscListOrdered,
	},
] as const;

function DashboardPage() {
	return (
		<div className="flex-1 overflow-y-auto">
			<div className="px-6 py-4 border-b border-border">
				<h1 className="text-lg font-semibold">Dashboard</h1>
				<p className="text-xs text-muted-foreground mt-1">
					Jump into one of the workspace modules.
				</p>
			</div>
			<div className="p-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{DASHBOARD_LINKS.map((link) => (
					<DashboardLink key={link.to} {...link} />
				))}
			</div>
		</div>
	);
}

function DashboardLink({ to, title, description, Icon }: DashboardLinkProps) {
	return (
		<Link
			to={to}
			className="group flex flex-col gap-2 rounded-lg border border-border bg-card p-4 transition-colors hover:border-foreground/30 hover:bg-accent/30"
		>
			<div className="flex items-center gap-2">
				<Icon className="size-4 text-muted-foreground transition-colors group-hover:text-foreground" />
				<span className="text-sm font-semibold">{title}</span>
			</div>
			<p className="text-xs text-muted-foreground">{description}</p>
		</Link>
	);
}
