import { createFileRoute } from "@tanstack/react-router";
import DashboardLayout from "@/tradeon-client/pages/dashboard/DashboardLayout";

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
  component: DashboardLayout,
});
