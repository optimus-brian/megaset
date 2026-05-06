import { registerSettingsSection } from "renderer/routes/_authenticated/settings/utils/settings-section-registry";
import { ForgejoAuthCard } from "./ForgejoAuthCard";

registerSettingsSection({
	id: "forgejo-auth",
	page: "account",
	order: 120,
	render: () => <ForgejoAuthCard />,
});
