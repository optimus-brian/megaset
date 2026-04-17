import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/_dashboard/issues")({
	component: IssuesLayout,
});

function IssuesLayout() {
	return <Outlet />;
}
