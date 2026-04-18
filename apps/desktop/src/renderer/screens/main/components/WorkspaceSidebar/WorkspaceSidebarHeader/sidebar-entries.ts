/**
 * Barrel that imports all feature-module sidebar entry registrations for
 * their side effects. Order here is the rendered order in the sidebar.
 *
 * Adding a new fork-only nav entry = new `register-sidebar-entry.ts` beside
 * the route module + one import line below. Zero changes to the header.
 */
import "renderer/routes/_authenticated/_dashboard/dashboard/register-sidebar-entry";
import "renderer/routes/_authenticated/_dashboard/issues/register-sidebar-entry";
import "renderer/routes/_authenticated/_dashboard/repos/register-sidebar-entry";
