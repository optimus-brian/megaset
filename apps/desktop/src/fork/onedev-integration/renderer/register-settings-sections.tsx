import { registerSettingsSection } from "renderer/routes/_authenticated/settings/utils/settings-section-registry";
import { OnedevAuthCard } from "./OnedevAuthCard";

registerSettingsSection({
	id: "onedev-auth",
	page: "account",
	order: 110,
	render: () => <OnedevAuthCard />,
});
