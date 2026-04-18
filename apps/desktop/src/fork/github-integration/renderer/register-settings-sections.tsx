import { Label } from "@superset/ui/label";
import { registerSettingsSection } from "renderer/routes/_authenticated/settings/utils/settings-section-registry";
import { GitHubAuthCard } from "./GitHubAuthCard";

// Group header for the "Git Providers" section. GitHub is the primary
// provider, so it owns the header and renders first.
registerSettingsSection({
	id: "git-providers-header",
	page: "git",
	order: 90,
	render: () => (
		<div className="space-y-0.5">
			<Label className="text-sm font-medium">Git Providers</Label>
			<p className="text-xs text-muted-foreground">
				Connect GitHub, OneDev, or Forgejo to read and create issues directly
				from Superset.
			</p>
		</div>
	),
});

registerSettingsSection({
	id: "github-auth",
	page: "git",
	order: 100,
	render: () => <GitHubAuthCard />,
});
