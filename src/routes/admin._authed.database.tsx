import { createFileRoute } from "@tanstack/react-router";
import AdminDatabasePage from "@/tradeon-client/pages/admin/AdminDatabasePage";

export const Route = createFileRoute("/admin/_authed/database")({
  head: () => ({
    meta: [
      { title: "Admin database — TRADEON" },
      { name: "description", content: "TRADEON database tools." },
      { property: "og:title", content: "Admin database — TRADEON" },
      { property: "og:description", content: "TRADEON database tools." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminDatabasePage,
});
