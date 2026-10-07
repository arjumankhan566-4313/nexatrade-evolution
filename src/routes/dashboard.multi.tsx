import { createFileRoute } from "@tanstack/react-router";
import MultiChartPage from "@/tradeon-client/pages/dashboard/MultiChartPage";

export const Route = createFileRoute("/dashboard/multi")({
  head: () => ({
    meta: [
      { title: "Multi chart — TRADEON" },
      { name: "description", content: "TRADEON multi-chart view." },
      { property: "og:title", content: "Multi chart — TRADEON" },
      { property: "og:description", content: "TRADEON multi-chart view." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MultiChartPage,
});
