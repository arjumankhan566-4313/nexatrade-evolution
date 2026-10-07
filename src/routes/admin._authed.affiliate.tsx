import { createFileRoute } from "@tanstack/react-router";
import AdminAffiliatePage from "@/tradeon-client/pages/admin/AdminAffiliatePage";

export const Route = createFileRoute("/admin/_authed/affiliate")({
  head: () => ({
    meta: [
      { title: "Admin affiliate — TRADEON" },
      { name: "description", content: "TRADEON affiliate management." },
      { property: "og:title", content: "Admin affiliate — TRADEON" },
      { property: "og:description", content: "TRADEON affiliate management." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminAffiliatePage,
});
