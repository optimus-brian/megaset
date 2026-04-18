import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";

/**
 * Forgejo (and Gitea) is self-hosted, so we need both a base URL and a PAT.
 * We pack them into a JSON blob and reuse the shared encrypted token slot —
 * the forgejo provider knows how to unpack `{url, token}` on read.
 */
export function ForgejoAuthCard() {
	const utils = electronTrpc.useUtils();
	const { data: configured, isLoading } =
		electronTrpc.gitProviders.isConfigured.useQuery({ provider: "forgejo" });
	const [url, setUrl] = useState("");
	const [pat, setPat] = useState("");

	const saveToken = electronTrpc.gitProviders.saveToken.useMutation({
		onSuccess: async () => {
			await utils.gitProviders.isConfigured.invalidate();
			toast.success("Forgejo credentials saved");
			setUrl("");
			setPat("");
		},
		onError: (err) => toast.error(`Failed to save: ${err.message}`),
	});

	const clearToken = electronTrpc.gitProviders.clearToken.useMutation({
		onSuccess: async () => {
			await utils.gitProviders.isConfigured.invalidate();
			toast.success("Forgejo credentials cleared");
		},
		onError: (err) => toast.error(`Failed to clear: ${err.message}`),
	});

	const handleSave = () => {
		const u = url.trim().replace(/\/+$/, "");
		const t = pat.trim();
		if (!u || !t) return;
		if (!/^https?:\/\//i.test(u)) {
			toast.error("Forgejo URL must start with http:// or https://");
			return;
		}
		saveToken.mutate({
			provider: "forgejo",
			token: JSON.stringify({ url: u, token: t }),
		});
	};

	return (
		<div className="rounded border border-border p-4 space-y-3">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<span className="text-sm font-medium">Forgejo / Gitea</span>
					<span
						className={`text-xs px-2 py-0.5 rounded ${
							configured
								? "bg-green-500/20 text-green-500"
								: "bg-muted text-muted-foreground"
						}`}
					>
						{isLoading ? "…" : configured ? "Connected" : "Not configured"}
					</span>
				</div>
				{configured && (
					<Button
						size="sm"
						variant="outline"
						disabled={clearToken.isPending}
						onClick={() => clearToken.mutate({ provider: "forgejo" })}
					>
						{clearToken.isPending ? "Clearing…" : "Disconnect"}
					</Button>
				)}
			</div>

			{!configured && !isLoading && (
				<div className="space-y-2">
					<Label htmlFor="fj-url" className="text-xs">
						Forgejo base URL
					</Label>
					<Input
						id="fj-url"
						type="text"
						placeholder="https://forgejo.example.com"
						value={url}
						onChange={(e) => setUrl(e.target.value)}
					/>
					<Label htmlFor="fj-pat" className="text-xs">
						Access token
					</Label>
					<Input
						id="fj-pat"
						type="password"
						placeholder="forgejo-pat-…"
						value={pat}
						onChange={(e) => setPat(e.target.value)}
					/>
					<p className="text-xs text-muted-foreground">
						Generate a token in your Forgejo profile under{" "}
						<em>Settings → Applications</em>. URL + token are stored encrypted
						in your macOS Keychain.
					</p>
					<Button
						size="sm"
						disabled={!url.trim() || !pat.trim() || saveToken.isPending}
						onClick={handleSave}
					>
						{saveToken.isPending ? "Saving…" : "Save"}
					</Button>
				</div>
			)}
		</div>
	);
}
