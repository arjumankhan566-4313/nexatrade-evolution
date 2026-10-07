import { createFileRoute } from "@tanstack/react-router";
import ChartLabPage from "@/tradeon-client/pages/dashboard/ChartLabPage";

export const Route = createFileRoute("/dashboard/chart-lab")({
  head: () => ({
    meta: [
      { title: "Chart Lab — TRADEON" },
      { name: "description", content: "TRADEON chart lab." },
      { property: "og:title", content: "Chart Lab — TRADEON" },
      { property: "og:description", content: "TRADEON chart lab." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChartLabPage,
});
