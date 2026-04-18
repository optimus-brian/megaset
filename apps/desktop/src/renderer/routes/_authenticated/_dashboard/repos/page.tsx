import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Spinner } from "@superset/ui/spinner";
import { toast } from "@superset/ui/sonner";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { FaGithub } from "react-icons/fa";
import { HiOutlineLockClosed, HiOutlineStar } from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { ProviderSetupCTA } from "../components/ProviderSetupCTA";

export const Route = createFileRoute("/_authenticated/_dashboard/repos/")({
	component: ReposPage,
});

type VisibilityFilter = "all" | "public" | "private";

function ReposPage() {
	const [visibility, setVisibility] = useState<VisibilityFilter>("all");
	const [search, setSearch] = useState("");
	const utils = electronTrpc.useUtils();

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

	const { data: existingProjects } =
		electronTrpc.projects.getRecents.useQuery();

	const clonedRepoNames = useMemo(() => {
		const set = new Set<string>();
		for (const p of existingProjects ?? []) {
			set.add(p.name.toLowerCase());
		}
		return set;
	}, [existingProjects]);

	const cloneRepo = electronTrpc.projects.cloneRepo.useMutation({
		onSuccess: (result) => {
			if (result.canceled) return;
			if (!result.success) {
				toast.error(`Clone failed: ${result.error ?? "unknown"}`);
				return;
			}
			toast.success(
				`Cloned ${result.project?.name ?? "repository"} — open it from the sidebar`,
			);
			utils.projects.getRecents.invalidate();
		},
		onError: (err) => toast.error(`Clone failed: ${err.message}`),
	});

	const { availableRepos, clonedRepos } = useMemo(() => {
		const q = search.trim().toLowerCase();
		const filtered = (repos ?? []).filter((r) => {
			if (!q) return true;
			return (
				r.fullName.toLowerCase().includes(q) ||
				(r.description?.toLowerCase().includes(q) ?? false)
			);
		});
		const cloned: typeof filtered = [];
		const available: typeof filtered = [];
		for (const r of filtered) {
			if (clonedRepoNames.has(r.name.toLowerCase())) {
				cloned.push(r);
			} else {
				available.push(r);
			}
		}
		return { availableRepos: available, clonedRepos: cloned };
	}, [repos, search, clonedRepoNames]);

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
			) : availableRepos.length === 0 && clonedRepos.length === 0 ? (
				<div className="flex-1 flex items-center justify-center p-6">
					<p className="text-sm text-muted-foreground text-center">
						{search
							? "No repositories match your filter."
							: "No repositories found for this account."}
					</p>
				</div>
			) : (
				<div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
					{availableRepos.length > 0 && (
						<section className="flex flex-col gap-2">
							<h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
								Available ({availableRepos.length})
							</h3>
							<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 auto-rows-min">
								{availableRepos.map((repo) => (
									<RepoCard
										key={repo.id}
										repo={repo}
										cloned={false}
										isCloning={
											cloneRepo.isPending &&
											cloneRepo.variables?.url === repo.cloneUrl
										}
										onClone={() => cloneRepo.mutate({ url: repo.cloneUrl })}
										cloneDisabled={cloneRepo.isPending}
									/>
								))}
							</div>
						</section>
					)}

					{clonedRepos.length > 0 && (
						<section className="flex flex-col gap-2">
							<h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
								Already cloned ({clonedRepos.length})
							</h3>
							<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 auto-rows-min">
								{clonedRepos.map((repo) => (
									<RepoCard
										key={repo.id}
										repo={repo}
										cloned={true}
										isCloning={false}
										onClone={() => {}}
										cloneDisabled={true}
									/>
								))}
							</div>
						</section>
					)}
				</div>
			)}
		</div>
	);
}

type RepoCardRepo = {
	id: string;
	fullName: string;
	htmlUrl: string;
	cloneUrl: string;
	description?: string;
	isPrivate: boolean;
	isFork: boolean;
	isArchived: boolean;
	defaultBranch: string;
	stars: number;
};

function RepoCard({
	repo,
	cloned,
	isCloning,
	onClone,
	cloneDisabled,
}: {
	repo: RepoCardRepo;
	cloned: boolean;
	isCloning: boolean;
	onClone: () => void;
	cloneDisabled: boolean;
}) {
	return (
		<div
			className={`rounded-md border border-border p-3 flex flex-col gap-2 bg-background transition-colors ${
				cloned
					? "opacity-50 hover:opacity-75"
					: "hover:border-muted-foreground"
			}`}
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
						<HiOutlineLockClosed className="size-3" aria-label="Private" />
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
				{cloned ? (
					<span className="text-[11px] text-muted-foreground italic">
						Already cloned
					</span>
				) : (
					<Button
						size="sm"
						variant="outline"
						disabled={cloneDisabled}
						onClick={onClone}
					>
						{isCloning ? "Cloning…" : "Clone as Project"}
					</Button>
				)}
			</div>
		</div>
	);
}
