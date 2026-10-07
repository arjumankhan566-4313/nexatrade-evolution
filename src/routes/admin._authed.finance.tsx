import { createFileRoute } from "@tanstack/react-router";
import AdminFinancePage from "@/tradeon-client/pages/admin/AdminFinancePage";

export const Route = createFileRoute("/admin/_authed/finance")({
  head: () => ({
    meta: [
      { title: "Admin finance — TRADEON" },
      { name: "description", content: "TRADEON deposits and withdrawals." },
      { property: "og:title", content: "Admin finance — TRADEON" },
      { property: "og:description", content: "TRADEON deposits and withdrawals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminFinancePage,
});
