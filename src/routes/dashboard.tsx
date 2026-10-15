import { createFileRoute, redirect } from "@tanstack/react-router";
import DashboardLayout from "@/tradeon-client/pages/dashboard/DashboardLayout";
import { useAuthStore } from "@/tradeon-client/stores/authStore";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — TRADEON" },
      { name: "description", content: "Your TRADEON trading dashboard." },
      { property: "og:title", content: "Dashboard — TRADEON" },
      { property: "og:description", content: "Your TRADEON trading dashboard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  // Auth guard for EVERY /dashboard/* child: runs before the layout renders, so
  // a guest never sees the dashboard shell flash before bouncing to /login.
  // SSR skips the check — the API proxy is not reliably reachable from the
  // server render; the client-side bootstrap covers the real session state.
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const store = useAuthStore.getState();
    if (store.status === "idle") await store.bootstrap();
    // Only an explicit "no session" redirects. An unreachable API leaves the
    // store in "error", and DashboardLayout shows a retry screen instead.
    if (useAuthStore.getState().status === "guest") {
      throw redirect({ to: "/login" });
    }
  },
  component: DashboardLayout,
});
