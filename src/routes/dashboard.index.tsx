import { createFileRoute } from "@tanstack/react-router";
import TerminalPage from "@/tradeon-client/pages/dashboard/TerminalPage";

export const Route = createFileRoute("/dashboard/")({
  head: () => ({
    meta: [
      { title: "Terminal — TRADEON" },
      { name: "description", content: "TRADEON trading terminal." },
      { property: "og:title", content: "Terminal — TRADEON" },
      { property: "og:description", content: "TRADEON trading terminal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TerminalPage,
});
