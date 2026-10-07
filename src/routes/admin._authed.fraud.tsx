import { createFileRoute } from "@tanstack/react-router";
import AdminFraudPage from "@/tradeon-client/pages/admin/AdminFraudPage";

export const Route = createFileRoute("/admin/_authed/fraud")({
  head: () => ({
    meta: [
      { title: "Admin fraud — TRADEON" },
      { name: "description", content: "TRADEON fraud review." },
      { property: "og:title", content: "Admin fraud — TRADEON" },
      { property: "og:description", content: "TRADEON fraud review." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminFraudPage,
});
