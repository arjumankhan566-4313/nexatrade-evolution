import { createFileRoute } from "@tanstack/react-router";
import HistoryPage from "@/tradeon-client/pages/dashboard/HistoryPage";

export const Route = createFileRoute("/dashboard/history")({
  head: () => ({
    meta: [
      { title: "Trade history — TRADEON" },
      { name: "description", content: "Your TRADEON trade history." },
      { property: "og:title", content: "Trade history — TRADEON" },
      { property: "og:description", content: "Your TRADEON trade history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HistoryPage,
});
