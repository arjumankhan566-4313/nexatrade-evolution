import { createFileRoute } from "@tanstack/react-router";
import AdminLogsPage from "@/tradeon-client/pages/admin/AdminLogsPage";

export const Route = createFileRoute("/admin/_authed/logs")({
  head: () => ({
    meta: [
      { title: "Admin logs — TRADEON" },
      { name: "description", content: "TRADEON audit logs." },
      { property: "og:title", content: "Admin logs — TRADEON" },
      { property: "og:description", content: "TRADEON audit logs." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminLogsPage,
});
