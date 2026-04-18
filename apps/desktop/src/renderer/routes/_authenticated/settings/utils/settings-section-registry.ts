import type { ReactNode } from "react";

export type SettingsPageKey =
	| "general"
	| "git"
	| "agents"
	| "account"
	| "behavior"
	| "project";

export interface SettingsSection {
	id: string;
	page: SettingsPageKey;
	render: () => ReactNode;
	/** Lower = earlier in the page. Default 100. */
	order?: number;
}

const sections: SettingsSection[] = [];

export function registerSettingsSection(section: SettingsSection): void {
	const existingIndex = sections.findIndex(
		(s) => s.id === section.id && s.page === section.page,
	);
	if (existingIndex >= 0) {
		sections[existingIndex] = section;
		return;
	}
	sections.push(section);
}

/**
 * Returns registered sections for a given page, sorted by ascending `order`
 * (default 100). Not a React hook — safe to call outside render.
 */
export function useSettingsSections(page: SettingsPageKey): SettingsSection[] {
	return sections
		.filter((s) => s.page === page)
		.slice()
		.sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
}
