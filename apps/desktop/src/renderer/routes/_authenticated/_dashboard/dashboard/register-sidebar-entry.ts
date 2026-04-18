/**
 * Registers the Dashboard sidebar nav entry.
 *
 * Imported for side effects from `sidebar-entries.ts` so the entry shows up
 * in {@link useSidebarEntries} without the header itself needing to know
 * about the Dashboard module.
 */
import { HiOutlineChartBarSquare } from "react-icons/hi2";
import { registerSidebarEntry } from "renderer/screens/main/components/WorkspaceSidebar/WorkspaceSidebarHeader/sidebar-entry-registry";

registerSidebarEntry({
	id: "dashboard",
	label: "Dashboard",
	icon: HiOutlineChartBarSquare,
	to: "/dashboard",
	placement: "before-upstream",
	useIsVisible: () => true,
});
