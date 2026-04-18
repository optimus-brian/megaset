import { Button } from "@superset/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { FaGithub } from "react-icons/fa";
import { SiLinear } from "react-icons/si";

type ProviderKey = "linear" | "github";

interface ProviderSetupCTAProps {
	provider: ProviderKey;
}

const PROVIDER_META: Record<
	ProviderKey,
	{
		icon: typeof SiLinear;
		label: string;
		description: string;
		settingsRoute: "/settings/integrations" | "/settings/git";
		buttonLabel: string;
	}
> = {
	linear: {
		icon: SiLinear,
		label: "Connect Linear",
		description:
			"Connect your Linear workspace to sync issues and manage tasks directly from Superset.",
		settingsRoute: "/settings/integrations",
		buttonLabel: "Connect Linear",
	},
	github: {
		icon: FaGithub,
		label: "Connect GitHub",
		description:
			"Add a GitHub Personal Access Token in settings to load issues for your projects.",
		settingsRoute: "/settings/git",
		buttonLabel: "Open Git Settings",
	},
};

export function ProviderSetupCTA({ provider }: ProviderSetupCTAProps) {
	const navigate = useNavigate();
	const meta = PROVIDER_META[provider];
	const Icon = meta.icon;

	return (
		<div className="flex-1 flex items-center justify-center p-6">
			<div className="flex flex-col items-center gap-4 max-w-md text-center">
				<div className="flex size-16 items-center justify-center rounded-xl border bg-muted/50">
					<Icon className="size-8" />
				</div>
				<div className="space-y-2">
					<h3 className="text-lg font-semibold">{meta.label}</h3>
					<p className="text-sm text-muted-foreground">{meta.description}</p>
				</div>
				<Button onClick={() => navigate({ to: meta.settingsRoute })}>
					{meta.buttonLabel}
				</Button>
			</div>
		</div>
	);
}
