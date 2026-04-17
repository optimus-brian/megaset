import { Spinner } from "@superset/ui/spinner";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { ProviderSetupCTA } from "../tasks/components/TasksView/components/ProviderSetupCTA";
import { IssuesKanbanBoard } from "./components/IssuesKanbanBoard";

export const Route = createFileRoute("/_authenticated/_dashboard/issues/")({
	component: IssuesPage,
});

function IssuesPage() {
	const { data: projects, isLoading: isProjectsLoading } =
		electronTrpc.projects.getRecents.useQuery();

	const projectOptions = useMemo(() => projects ?? [], [projects]);

	const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
		null,
	);
	const effectiveProjectId =
		selectedProjectId ?? projectOptions[0]?.id ?? null;

	const { data: ghConfigured, isLoading: isGhLoading } =
		electronTrpc.gitProviders.isConfigured.useQuery({ provider: "github" });

	const { data: result, isLoading: isIssuesLoading } =
		electronTrpc.gitProviders.listIssuesForProject.useQuery(
			{ projectId: effectiveProjectId ?? "", state: "all" },
			{
				enabled: !!effectiveProjectId && ghConfigured === true,
				refetchInterval: 60_000,
			},
		);

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

	if (projectOptions.length === 0) {
		return (
			<div className="flex-1 flex items-center justify-center p-6">
				<p className="text-sm text-muted-foreground text-center">
					No projects yet. Open a git repository as a project first.
				</p>
			</div>
		);
	}

	return (
		<div className="flex-1 flex flex-col min-h-0 overflow-hidden">
			<div className="flex items-center gap-2 px-4 py-2 border-b border-border">
				<label
					htmlFor="project-select"
					className="text-xs text-muted-foreground"
				>
					Project:
				</label>
				<select
					id="project-select"
					value={effectiveProjectId ?? ""}
					onChange={(e) => setSelectedProjectId(e.target.value)}
					className="text-sm bg-background border border-border rounded px-2 py-1"
				>
					{projectOptions.map((p) => (
						<option key={p.id} value={p.id}>
							{p.name}
						</option>
					))}
				</select>
				{result && result.provider && (
					<span className="text-xs text-muted-foreground ml-auto">
						via {result.provider}
					</span>
				)}
			</div>

			{isIssuesLoading ? (
				<div className="flex-1 flex items-center justify-center">
					<Spinner className="size-5" />
				</div>
			) : !result || !result.provider ? (
				<div className="flex-1 flex items-center justify-center p-6">
					<p className="text-sm text-muted-foreground text-center">
						This project doesn't have a recognized git remote (GitHub / OneDev /
						Forgejo).
					</p>
				</div>
			) : (
				<IssuesKanbanBoard issues={result.issues} />
			)}
		</div>
	);
}
