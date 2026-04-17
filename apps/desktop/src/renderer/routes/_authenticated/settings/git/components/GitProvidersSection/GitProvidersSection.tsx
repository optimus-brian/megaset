import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";

export function GitProvidersSection() {
	const utils = electronTrpc.useUtils();

	const { data: ghConfigured, isLoading: isGhConfiguredLoading } =
		electronTrpc.gitProviders.isConfigured.useQuery({ provider: "github" });

	const [pat, setPat] = useState("");

	const saveToken = electronTrpc.gitProviders.saveToken.useMutation({
		onSuccess: async () => {
			await utils.gitProviders.isConfigured.invalidate();
			toast.success("GitHub token saved");
			setPat("");
		},
		onError: (err) => toast.error(`Failed to save: ${err.message}`),
	});

	const clearToken = electronTrpc.gitProviders.clearToken.useMutation({
		onSuccess: async () => {
			await utils.gitProviders.isConfigured.invalidate();
			toast.success("GitHub token cleared");
		},
		onError: (err) => toast.error(`Failed to clear: ${err.message}`),
	});

	return (
		<div className="space-y-4">
			<div className="space-y-0.5">
				<Label className="text-sm font-medium">Git Providers</Label>
				<p className="text-xs text-muted-foreground">
					Connect GitHub, OneDev, or Forgejo to read and create issues directly
					from Superset.
				</p>
			</div>

			<div className="rounded border border-border p-4 space-y-3">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<span className="text-sm font-medium">GitHub</span>
						<span
							className={`text-xs px-2 py-0.5 rounded ${
								ghConfigured
									? "bg-green-500/20 text-green-500"
									: "bg-muted text-muted-foreground"
							}`}
						>
							{isGhConfiguredLoading
								? "…"
								: ghConfigured
									? "Connected"
									: "Not configured"}
						</span>
					</div>
					{ghConfigured && (
						<Button
							size="sm"
							variant="outline"
							disabled={clearToken.isPending}
							onClick={() => clearToken.mutate({ provider: "github" })}
						>
							{clearToken.isPending ? "Clearing…" : "Disconnect"}
						</Button>
					)}
				</div>

				{!ghConfigured && !isGhConfiguredLoading && (
					<div className="space-y-2">
						<Label htmlFor="gh-pat" className="text-xs">
							Personal Access Token
						</Label>
						<Input
							id="gh-pat"
							type="password"
							placeholder="ghp_…"
							value={pat}
							onChange={(e) => setPat(e.target.value)}
						/>
						<p className="text-xs text-muted-foreground">
							Create one at{" "}
							<a
								href="https://github.com/settings/tokens/new?scopes=repo&description=Superset%20Hyperset%20Fork"
								target="_blank"
								rel="noopener noreferrer"
								className="underline"
							>
								github.com/settings/tokens
							</a>{" "}
							with the <code className="bg-muted px-1 rounded">repo</code>{" "}
							scope. Stored encrypted in your macOS Keychain.
						</p>
						<Button
							size="sm"
							disabled={!pat.trim() || saveToken.isPending}
							onClick={() =>
								saveToken.mutate({ provider: "github", token: pat.trim() })
							}
						>
							{saveToken.isPending ? "Saving…" : "Save"}
						</Button>
					</div>
				)}
			</div>
		</div>
	);
}
