import { createFileRoute } from "@tanstack/react-router";
import AdminLayout from "@/tradeon-client/pages/admin/AdminLayout";

export const Route = createFileRoute("/admin/_authed")({
  head: () => ({
    meta: [
      { title: "Admin — TRADEON" },
      { name: "description", content: "TRADEON admin panel." },
      { property: "og:title", content: "Admin — TRADEON" },
      { property: "og:description", content: "TRADEON admin panel." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminLayout,
});
