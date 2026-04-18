import { registerSettingsSection } from "renderer/routes/_authenticated/settings/utils/settings-section-registry";
import { ForgejoAuthCard } from "./ForgejoAuthCard";

registerSettingsSection({
	id: "forgejo-auth",
	page: "git",
	order: 120,
	render: () => <ForgejoAuthCard />,
});
