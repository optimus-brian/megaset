import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Spinner } from "@superset/ui/spinner";
import { toast } from "@superset/ui/sonner";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { FaGithub } from "react-icons/fa";
import { HiOutlineLockClosed, HiOutlineStar } from "react-icons/hi2";
import { ProviderSetupCTA } from "../tasks/components/TasksView/components/ProviderSetupCTA";
import { electronTrpc } from "renderer/lib/electron-trpc";

export const Route = createFileRoute("/_authenticated/_dashboard/repos/")({
	component: ReposPage,
});

type VisibilityFilter = "all" | "public" | "private";

function ReposPage() {
	const [visibility, setVisibility] = useState<VisibilityFilter>("all");
	const [search, setSearch] = useState("");

	const { data: ghConfigured, isLoading: isGhLoading } =
		electronTrpc.gitProviders.isConfigured.useQuery({ provider: "github" });

	const {
		data: repos,
		isLoading: isReposLoading,
		error: reposError,
	} = electronTrpc.gitProviders.listRepositories.useQuery(
		{ provider: "github", visibility },
		{ enabled: ghConfigured === true },
	);

	const cloneRepo = electronTrpc.projects.cloneRepo.useMutation({
		onSuccess: (result) => {
			if (result.canceled) return;
			if (!result.success) {
				toast.error(`Clone failed: ${result.error ?? "unknown"}`);
				return;
			}
			toast.success("Repository cloned");
		},
		onError: (err) => toast.error(`Clone failed: ${err.message}`),
	});

	const filteredRepos = useMemo(() => {
		if (!repos) return [];
		const q = search.trim().toLowerCase();
		if (!q) return repos;
		return repos.filter(
			(r) =>
				r.fullName.toLowerCase().includes(q) ||
				(r.description?.toLowerCase().includes(q) ?? false),
		);
	}, [repos, search]);

	if (isGhLoading) {
		return (
			<div className="flex-1 flex items-center justify-center">
				<Spinner className="size-5" />
			</div>
		);
	}

	if (!ghConfigured) {
		return <ProviderSetupCTA provider="github" />;
	}

	return (
		<div className="flex-1 flex flex-col min-h-0 overflow-hidden">
			<div className="flex items-center gap-2 px-4 py-3 border-b border-border">
				<FaGithub className="size-4 text-muted-foreground" />
				<span className="text-sm font-medium">GitHub Repositories</span>
				<div className="ml-auto flex items-center gap-2">
					<Input
						placeholder="Filter by name or description…"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="h-8 w-64 text-sm"
					/>
					<select
						value={visibility}
						onChange={(e) =>
							setVisibility(e.target.value as VisibilityFilter)
						}
						className="text-sm bg-background border border-border rounded px-2 py-1 h-8"
					>
						<option value="all">All</option>
						<option value="public">Public</option>
						<option value="private">Private</option>
					</select>
				</div>
			</div>

			{isReposLoading ? (
				<div className="flex-1 flex items-center justify-center">
					<Spinner className="size-5" />
				</div>
			) : reposError ? (
				<div className="flex-1 flex items-center justify-center p-6">
					<p className="text-sm text-destructive text-center max-w-md">
						Failed to load repositories: {reposError.message}
					</p>
				</div>
			) : filteredRepos.length === 0 ? (
				<div className="flex-1 flex items-center justify-center p-6">
					<p className="text-sm text-muted-foreground text-center">
						{search
							? "No repositories match your filter."
							: "No repositories found for this account."}
					</p>
				</div>
			) : (
				<div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 auto-rows-min">
					{filteredRepos.map((repo) => (
						<div
							key={repo.id}
							className="rounded-md border border-border p-3 flex flex-col gap-2 bg-background hover:border-muted-foreground transition-colors"
						>
							<div className="flex items-start justify-between gap-2">
								<a
									href={repo.htmlUrl}
									target="_blank"
									rel="noopener noreferrer"
									className="text-sm font-medium hover:underline truncate"
								>
									{repo.fullName}
								</a>
								<div className="flex items-center gap-1 text-muted-foreground shrink-0">
									{repo.isPrivate && (
										<HiOutlineLockClosed
											className="size-3"
											aria-label="Private"
										/>
									)}
									<HiOutlineStar className="size-3" />
									<span className="text-[10px]">{repo.stars}</span>
								</div>
							</div>

							{repo.description && (
								<p className="text-xs text-muted-foreground line-clamp-2">
									{repo.description}
								</p>
							)}

							<div className="flex flex-wrap gap-1">
								{repo.isFork && (
									<span className="text-[10px] px-1.5 py-0.5 bg-muted text-muted-foreground rounded">
										fork
									</span>
								)}
								{repo.isArchived && (
									<span className="text-[10px] px-1.5 py-0.5 bg-amber-500/20 text-amber-500 rounded">
										archived
									</span>
								)}
								<span className="text-[10px] px-1.5 py-0.5 bg-muted text-muted-foreground rounded">
									{repo.defaultBranch}
								</span>
							</div>

							<div className="flex items-center justify-end gap-2 mt-auto">
								<Button
									size="sm"
									variant="outline"
									disabled={cloneRepo.isPending}
									onClick={() => cloneRepo.mutate({ url: repo.cloneUrl })}
								>
									{cloneRepo.isPending && cloneRepo.variables?.url === repo.cloneUrl
										? "Cloning…"
										: "Clone as Project"}
								</Button>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
