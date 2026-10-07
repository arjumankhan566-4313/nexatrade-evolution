import { createFileRoute } from "@tanstack/react-router";
import HomePage from "@/tradeon-client/pages/HomePage";

export const Route = createFileRoute("/status")({
  head: () => ({
    meta: [
      { title: "Status — TRADEON" },
      { name: "description", content: "TRADEON platform status." },
      { property: "og:title", content: "Status — TRADEON" },
      { property: "og:description", content: "TRADEON platform status." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HomePage,
});
