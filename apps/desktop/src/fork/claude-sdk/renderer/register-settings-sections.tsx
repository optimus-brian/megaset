import { registerSettingsSection } from "renderer/routes/_authenticated/settings/utils/settings-section-registry";
import { ClaudeSdkAgentCard } from "./ClaudeSdkAgentCard";

registerSettingsSection({
	id: "claude-sdk",
	page: "agents",
	order: 100,
	render: () => <ClaudeSdkAgentCard />,
});
