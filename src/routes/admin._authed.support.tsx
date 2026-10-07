import { createFileRoute } from "@tanstack/react-router";
import AdminSupportPage from "@/tradeon-client/pages/admin/AdminSupportPage";

export const Route = createFileRoute("/admin/_authed/support")({
  head: () => ({
    meta: [
      { title: "Admin support — TRADEON" },
      { name: "description", content: "TRADEON support inbox." },
      { property: "og:title", content: "Admin support — TRADEON" },
      { property: "og:description", content: "TRADEON support inbox." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminSupportPage,
});
