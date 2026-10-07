import { createFileRoute } from "@tanstack/react-router";
import AffiliatePage from "@/tradeon-client/pages/dashboard/AffiliatePage";

export const Route = createFileRoute("/dashboard/affiliate")({
  head: () => ({
    meta: [
      { title: "Affiliate — TRADEON" },
      { name: "description", content: "TRADEON affiliate programme." },
      { property: "og:title", content: "Affiliate — TRADEON" },
      { property: "og:description", content: "TRADEON affiliate programme." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AffiliatePage,
});
