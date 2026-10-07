import { createFileRoute } from "@tanstack/react-router";
import AdminOtcPage from "@/tradeon-client/pages/admin/AdminOtcPage";

export const Route = createFileRoute("/admin/_authed/otc")({
  head: () => ({
    meta: [
      { title: "Admin OTC — TRADEON" },
      { name: "description", content: "TRADEON OTC market console." },
      { property: "og:title", content: "Admin OTC — TRADEON" },
      { property: "og:description", content: "TRADEON OTC market console." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminOtcPage,
});
