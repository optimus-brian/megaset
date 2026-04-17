import type { Issue } from "@superset/git-provider-core";
import { Spinner } from "@superset/ui/spinner";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { ProviderSetupCTA } from "../tasks/components/TasksView/components/ProviderSetupCTA";
import { IssueDetailSidebar } from "./components/IssueDetailSidebar";
import { ProjectIssuesSection } from "./components/ProjectIssuesSection";

export const Route = createFileRoute("/_authenticated/_dashboard/issues/")({
	component: IssuesPage,
});

interface SelectedIssue {
	issue: Issue;
	projectId: string;
}

function IssuesPage() {
	const { data: projects, isLoading: isProjectsLoading } =
		electronTrpc.projects.getRecents.useQuery();

	const { data: ghConfigured, isLoading: isGhLoading } =
		electronTrpc.gitProviders.isConfigured.useQuery({ provider: "github" });

	const [selected, setSelected] = useState<SelectedIssue | null>(null);

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
			<div className="flex-1 overflow-y-auto p-4 space-y-4 min-w-0">
				{projectList.map((project) => (
					<ProjectIssuesSection
						key={project.id}
						projectId={project.id}
						projectName={project.name}
						onIssueClick={(issue, projectId) =>
							setSelected({ issue, projectId })
						}
						activeIssueId={selected?.issue.id}
					/>
				))}
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
