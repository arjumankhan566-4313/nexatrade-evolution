import { createFileRoute } from "@tanstack/react-router";
import ChartPage from "@/tradeon-client/pages/ChartPage";

export const Route = createFileRoute("/chart")({
  head: () => ({
    meta: [
      { title: "Chart — TRADEON" },
      { name: "description", content: "Live TRADEON market chart." },
      { property: "og:title", content: "Chart — TRADEON" },
      { property: "og:description", content: "Live TRADEON market chart." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChartPage,
});
