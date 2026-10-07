import { createFileRoute } from "@tanstack/react-router";
import AdminUsersPage from "@/tradeon-client/pages/admin/AdminUsersPage";

export const Route = createFileRoute("/admin/_authed/users")({
  head: () => ({
    meta: [
      { title: "Admin users — TRADEON" },
      { name: "description", content: "Manage TRADEON users." },
      { property: "og:title", content: "Admin users — TRADEON" },
      { property: "og:description", content: "Manage TRADEON users." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminUsersPage,
});
