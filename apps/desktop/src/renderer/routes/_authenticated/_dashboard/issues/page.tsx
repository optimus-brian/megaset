import type { Issue } from "@superset/git-provider-core";
import { Spinner } from "@superset/ui/spinner";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { ProviderSetupCTA } from "../components/ProviderSetupCTA";
import { IssueDetailSidebar } from "./components/IssueDetailSidebar";
import { ProjectIssuesSection } from "./components/ProjectIssuesSection";

export const Route = createFileRoute("/_authenticated/_dashboard/issues/")({
	component: IssuesPage,
});

interface SelectedIssue {
	issue: Issue;
	projectId: string;
}

const CATEGORY_TABS: { value: Issue["state"]; label: string }[] = [
	{ value: "open", label: "Open" },
	{ value: "in_progress", label: "In Progress" },
	{ value: "closed", label: "Closed" },
];

const ALL_CATEGORIES = new Set<Issue["state"]>(
	CATEGORY_TABS.map((t) => t.value),
);

function IssuesPage() {
	const { data: projects, isLoading: isProjectsLoading } =
		electronTrpc.projects.getRecents.useQuery();

	const { data: ghConfigured, isLoading: isGhLoading } =
		electronTrpc.gitProviders.isConfigured.useQuery({ provider: "github" });

	const [selected, setSelected] = useState<SelectedIssue | null>(null);
	const [visible, setVisible] = useState<Set<Issue["state"]>>(
		() => new Set(ALL_CATEGORIES),
	);

	const toggleCategory = (cat: Issue["state"]) => {
		setVisible((prev) => {
			const next = new Set(prev);
			if (next.has(cat)) {
				if (next.size === 1) return prev; // don't allow empty set
				next.delete(cat);
			} else {
				next.add(cat);
			}
			return next;
		});
	};

	const allSelected = visible.size === ALL_CATEGORIES.size;

	if (isGhLoading || isProjectsLoading) {
		return (
			<div className="flex-1 flex items-center justify-center">
				<Spinner className="size-5" />
			</div>
		);
	}

	if (!ghConfigured) {
		return <ProviderSetupCTA provider="github" />;
	}

	const projectList = projects ?? [];

	if (projectList.length === 0) {
		return (
			<div className="flex-1 flex items-center justify-center p-6">
				<p className="text-sm text-muted-foreground text-center">
					No projects yet. Clone a repository in the Repos tab first.
				</p>
			</div>
		);
	}

	return (
		<div className="flex flex-1 min-h-0 overflow-hidden">
			<div className="flex-1 flex flex-col min-w-0 min-h-0">
				<div className="shrink-0 px-4 pt-3 pb-2 flex items-center gap-1 border-b border-border">
					<button
						type="button"
						onClick={() => setVisible(new Set(ALL_CATEGORIES))}
						className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
							allSelected
								? "bg-accent text-foreground"
								: "text-muted-foreground hover:bg-accent/40"
						}`}
					>
						All
					</button>
					<span className="mx-1 h-4 w-px bg-border" aria-hidden />
					{CATEGORY_TABS.map((tab) => {
						const active = visible.has(tab.value);
						return (
							<button
								key={tab.value}
								type="button"
								onClick={() => toggleCategory(tab.value)}
								className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
									active
										? "bg-accent text-foreground"
										: "text-muted-foreground hover:bg-accent/40"
								}`}
							>
								{tab.label}
							</button>
						);
					})}
				</div>
				<div className="flex-1 overflow-y-auto p-4 space-y-4">
					{projectList.map((project) => (
						<ProjectIssuesSection
							key={project.id}
							projectId={project.id}
							projectName={project.name}
							onIssueClick={(issue, projectId) =>
								setSelected({ issue, projectId })
							}
							activeIssueId={selected?.issue.id}
							visibleCategories={allSelected ? undefined : visible}
						/>
					))}
				</div>
			</div>
			{selected && (
				<IssueDetailSidebar
					issue={selected.issue}
					projectId={selected.projectId}
					onClose={() => setSelected(null)}
				/>
			)}
		</div>
	);
}
