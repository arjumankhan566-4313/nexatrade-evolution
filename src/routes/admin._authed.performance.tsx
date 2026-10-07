import { createFileRoute } from "@tanstack/react-router";
import AdminPerformancePage from "@/tradeon-client/pages/admin/AdminPerformancePage";

export const Route = createFileRoute("/admin/_authed/performance")({
  head: () => ({
    meta: [
      { title: "Admin performance — TRADEON" },
      { name: "description", content: "TRADEON performance metrics." },
      { property: "og:title", content: "Admin performance — TRADEON" },
      { property: "og:description", content: "TRADEON performance metrics." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPerformancePage,
});
