import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { toast } from "@superset/ui/sonner";
import { Spinner } from "@superset/ui/spinner";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import type { IconType } from "react-icons";
import { FaGithub } from "react-icons/fa";
import { HiOutlineLockClosed, HiOutlineStar } from "react-icons/hi2";
import { VscServer } from "react-icons/vsc";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { ProviderSetupCTA } from "../components/ProviderSetupCTA";

export const Route = createFileRoute("/_authenticated/_dashboard/repos/")({
	component: ReposPage,
});

type VisibilityFilter = "all" | "public" | "private";

type ProviderName = "github" | "onedev" | "forgejo";

const PROVIDER_META: Record<ProviderName, { label: string; icon: IconType }> = {
	github: { label: "GitHub", icon: FaGithub },
	onedev: { label: "OneDev", icon: VscServer },
	forgejo: { label: "Forgejo", icon: VscServer },
};

function ReposPage() {
	const [visibility, setVisibility] = useState<VisibilityFilter>("all");
	const [search, setSearch] = useState("");
	const utils = electronTrpc.useUtils();

	const { data: ghConfigured, isLoading: isGhConfigLoading } =
		electronTrpc.gitProviders.isConfigured.useQuery({ provider: "github" });
	const { data: onedevConfigured, isLoading: isOnedevConfigLoading } =
		electronTrpc.gitProviders.isConfigured.useQuery({ provider: "onedev" });

	const anyConfigured = ghConfigured === true || onedevConfigured === true;
	const isAnyConfigLoading = isGhConfigLoading || isOnedevConfigLoading;

	const {
		data: allRepos,
		isLoading: isReposLoading,
		error: reposError,
	} = electronTrpc.gitProviders.listAllRepositories.useQuery(
		{ visibility },
		{ enabled: anyConfigured },
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

	const groupedRepos = useMemo(() => {
		const q = search.trim().toLowerCase();
		const groups = allRepos?.groups ?? [];
		return groups.map((group) => {
			const filtered = group.repositories.filter((r) => {
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
			return {
				provider: group.provider as ProviderName,
				error: group.error,
				availableRepos: available,
				clonedRepos: cloned,
				totalMatched: filtered.length,
			};
		});
	}, [allRepos, search, clonedRepoNames]);

	const totalMatched = groupedRepos.reduce((sum, g) => sum + g.totalMatched, 0);

	if (isAnyConfigLoading) {
		return (
			<div className="flex-1 flex items-center justify-center">
				<Spinner className="size-5" />
			</div>
		);
	}

	if (!anyConfigured) {
		return <ProviderSetupCTA provider="github" />;
	}

	return (
		<div className="flex-1 flex flex-col min-h-0 overflow-hidden">
			<div className="flex items-center gap-2 px-4 py-3 border-b border-border">
				<span className="text-sm font-medium">Repositories</span>
				<div className="ml-auto flex items-center gap-2">
					<Input
						placeholder="Filter by name or description…"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="h-8 w-64 text-sm"
					/>
					<select
						value={visibility}
						onChange={(e) => setVisibility(e.target.value as VisibilityFilter)}
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
			) : totalMatched === 0 && groupedRepos.every((g) => !g.error) ? (
				<div className="flex-1 flex items-center justify-center p-6">
					<p className="text-sm text-muted-foreground text-center">
						{search
							? "No repositories match your filter."
							: "No repositories found for your configured providers."}
					</p>
				</div>
			) : (
				<div className="flex-1 overflow-y-auto p-4 flex flex-col gap-8">
					{groupedRepos.map((group) => (
						<ProviderSection
							key={group.provider}
							provider={group.provider}
							error={group.error}
							availableRepos={group.availableRepos}
							clonedRepos={group.clonedRepos}
							onClone={(url) => cloneRepo.mutate({ url })}
							cloningUrl={
								cloneRepo.isPending ? cloneRepo.variables?.url : undefined
							}
							cloneDisabled={cloneRepo.isPending}
						/>
					))}
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

function ProviderSection({
	provider,
	error,
	availableRepos,
	clonedRepos,
	onClone,
	cloningUrl,
	cloneDisabled,
}: {
	provider: ProviderName;
	error: string | null;
	availableRepos: RepoCardRepo[];
	clonedRepos: RepoCardRepo[];
	onClone: (url: string) => void;
	cloningUrl: string | undefined;
	cloneDisabled: boolean;
}) {
	const meta = PROVIDER_META[provider] ?? {
		label: provider,
		icon: VscServer,
	};
	const Icon = meta.icon;

	const isEmpty =
		!error && availableRepos.length === 0 && clonedRepos.length === 0;

	return (
		<section className="flex flex-col gap-3">
			<div className="flex items-center gap-2 px-1">
				<Icon className="size-4 text-muted-foreground" />
				<h2 className="text-sm font-semibold">{meta.label}</h2>
			</div>

			{error ? (
				<p className="text-xs text-destructive px-1">
					Failed to load {meta.label} repositories: {error}
				</p>
			) : isEmpty ? (
				<p className="text-xs text-muted-foreground px-1">
					No repositories found.
				</p>
			) : (
				<div className="flex flex-col gap-5">
					{availableRepos.length > 0 && (
						<div className="flex flex-col gap-1">
							<h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
								Available ({availableRepos.length})
							</h3>
							<div className="flex flex-col rounded-md border border-border divide-y divide-border">
								{availableRepos.map((repo) => (
									<RepoRow
										key={repo.id}
										repo={repo}
										cloned={false}
										isCloning={cloningUrl === repo.cloneUrl}
										onClone={() => onClone(repo.cloneUrl)}
										cloneDisabled={cloneDisabled}
									/>
								))}
							</div>
						</div>
					)}

					{clonedRepos.length > 0 && (
						<div className="flex flex-col gap-1">
							<h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
								Already cloned ({clonedRepos.length})
							</h3>
							<div className="flex flex-col rounded-md border border-border divide-y divide-border">
								{clonedRepos.map((repo) => (
									<RepoRow
										key={repo.id}
										repo={repo}
										cloned={true}
										isCloning={false}
										onClone={() => {}}
										cloneDisabled={true}
									/>
								))}
							</div>
						</div>
					)}
				</div>
			)}
		</section>
	);
}

function RepoRow({
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
			className={`flex items-center gap-3 px-3 py-2 hover:bg-muted/30 transition-colors ${
				cloned ? "opacity-50" : ""
			}`}
		>
			<div className="flex-1 min-w-0 flex items-center gap-3">
				<a
					href={repo.htmlUrl}
					target="_blank"
					rel="noopener noreferrer"
					className="text-sm font-medium hover:underline truncate shrink-0"
				>
					{repo.fullName}
				</a>
				{repo.description && (
					<p className="text-xs text-muted-foreground truncate">
						{repo.description}
					</p>
				)}
			</div>

			<div className="flex items-center gap-1.5 shrink-0 text-muted-foreground">
				{repo.isPrivate && (
					<HiOutlineLockClosed className="size-3" aria-label="Private" />
				)}
				{repo.isFork && (
					<span className="text-[10px] px-1 py-0.5 bg-muted rounded">fork</span>
				)}
				{repo.isArchived && (
					<span className="text-[10px] px-1 py-0.5 bg-amber-500/20 text-amber-500 rounded">
						archived
					</span>
				)}
				<span className="text-[10px] px-1 py-0.5 bg-muted rounded">
					{repo.defaultBranch}
				</span>
				{repo.stars > 0 && (
					<span className="flex items-center gap-0.5 text-[10px]">
						<HiOutlineStar className="size-3" />
						{repo.stars}
					</span>
				)}
			</div>

			<div className="shrink-0 w-[130px] text-right">
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
						className="h-7 text-xs"
					>
						{isCloning ? "Cloning…" : "Clone as Project"}
					</Button>
				)}
			</div>
		</div>
	);
}
