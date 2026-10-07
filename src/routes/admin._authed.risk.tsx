import { createFileRoute } from "@tanstack/react-router";
import AdminRiskPage from "@/tradeon-client/pages/admin/AdminRiskPage";

export const Route = createFileRoute("/admin/_authed/risk")({
  head: () => ({
    meta: [
      { title: "Admin risk — TRADEON" },
      { name: "description", content: "TRADEON risk management." },
      { property: "og:title", content: "Admin risk — TRADEON" },
      { property: "og:description", content: "TRADEON risk management." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminRiskPage,
});
