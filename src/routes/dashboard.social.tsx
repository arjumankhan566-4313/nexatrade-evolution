import { createFileRoute } from "@tanstack/react-router";
import CopyTradingPage from "@/tradeon-client/pages/dashboard/CopyTradingPage";

export const Route = createFileRoute("/dashboard/social")({
  head: () => ({
    meta: [
      { title: "Copy trading — TRADEON" },
      { name: "description", content: "TRADEON copy trading." },
      { property: "og:title", content: "Copy trading — TRADEON" },
      { property: "og:description", content: "TRADEON copy trading." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CopyTradingPage,
});
