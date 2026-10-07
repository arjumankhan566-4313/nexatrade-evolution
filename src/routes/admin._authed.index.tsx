import { createFileRoute } from "@tanstack/react-router";
import AdminDashboardPage from "@/tradeon-client/pages/admin/AdminDashboardPage";

export const Route = createFileRoute("/admin/_authed/")({
  head: () => ({
    meta: [
      { title: "Admin dashboard — TRADEON" },
      { name: "description", content: "TRADEON admin overview." },
      { property: "og:title", content: "Admin dashboard — TRADEON" },
      { property: "og:description", content: "TRADEON admin overview." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminDashboardPage,
});
