import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";

/**
 * OneDev needs both a base URL (self-hosted) and a PAT. We pack them
 * into a JSON blob and reuse the shared encrypted token slot — the
 * onedev provider knows how to unpack `{url, token}` on read.
 */
export function OnedevAuthCard() {
	const utils = electronTrpc.useUtils();
	const { data: configured, isLoading } =
		electronTrpc.gitProviders.isConfigured.useQuery({ provider: "onedev" });
	const [url, setUrl] = useState("");
	const [pat, setPat] = useState("");

	const saveToken = electronTrpc.gitProviders.saveToken.useMutation({
		onSuccess: async () => {
			await utils.gitProviders.isConfigured.invalidate();
			toast.success("OneDev credentials saved");
			setUrl("");
			setPat("");
		},
		onError: (err) => toast.error(`Failed to save: ${err.message}`),
	});

	const clearToken = electronTrpc.gitProviders.clearToken.useMutation({
		onSuccess: async () => {
			await utils.gitProviders.isConfigured.invalidate();
			toast.success("OneDev credentials cleared");
		},
		onError: (err) => toast.error(`Failed to clear: ${err.message}`),
	});

	const handleSave = () => {
		const u = url.trim().replace(/\/+$/, "");
		const t = pat.trim();
		if (!u || !t) return;
		if (!/^https?:\/\//i.test(u)) {
			toast.error("OneDev URL must start with http:// or https://");
			return;
		}
		saveToken.mutate({
			provider: "onedev",
			token: JSON.stringify({ url: u, token: t }),
		});
	};

	return (
		<div className="rounded border border-border p-4 space-y-3">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<span className="text-sm font-medium">OneDev</span>
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
						onClick={() => clearToken.mutate({ provider: "onedev" })}
					>
						{clearToken.isPending ? "Clearing…" : "Disconnect"}
					</Button>
				)}
			</div>

			{!configured && !isLoading && (
				<div className="space-y-2">
					<Label htmlFor="od-url" className="text-xs">
						OneDev base URL
					</Label>
					<Input
						id="od-url"
						type="text"
						placeholder="https://onedev.example.com"
						value={url}
						onChange={(e) => setUrl(e.target.value)}
					/>
					<Label htmlFor="od-pat" className="text-xs">
						Access token
					</Label>
					<Input
						id="od-pat"
						type="password"
						placeholder="onedev-pat-…"
						value={pat}
						onChange={(e) => setPat(e.target.value)}
					/>
					<p className="text-xs text-muted-foreground">
						Generate a token in your OneDev profile under <em>Access Tokens</em>
						. URL + token are stored encrypted in your macOS Keychain.
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
