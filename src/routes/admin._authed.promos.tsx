import { createFileRoute } from "@tanstack/react-router";
import AdminPromosPage from "@/tradeon-client/pages/admin/AdminPromosPage";

export const Route = createFileRoute("/admin/_authed/promos")({
  head: () => ({
    meta: [
      { title: "Admin promos — TRADEON" },
      { name: "description", content: "TRADEON promotions." },
      { property: "og:title", content: "Admin promos — TRADEON" },
      { property: "og:description", content: "TRADEON promotions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPromosPage,
});
