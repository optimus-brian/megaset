import { Label } from "@superset/ui/label";
import { GitHubAuthCard } from "./components/GitHubAuthCard";
import { OnedevAuthCard } from "./components/OnedevAuthCard";

export function GitProvidersSection() {
	return (
		<div className="space-y-4">
			<div className="space-y-0.5">
				<Label className="text-sm font-medium">Git Providers</Label>
				<p className="text-xs text-muted-foreground">
					Connect GitHub, OneDev, or Forgejo to read and create issues directly
					from Superset.
				</p>
			</div>

			<GitHubAuthCard />
			<OnedevAuthCard />
		</div>
	);
}
