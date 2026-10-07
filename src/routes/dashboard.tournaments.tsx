import { createFileRoute } from "@tanstack/react-router";
import TournamentsPage from "@/tradeon-client/pages/dashboard/TournamentsPage";

export const Route = createFileRoute("/dashboard/tournaments")({
  head: () => ({
    meta: [
      { title: "Tournaments — TRADEON" },
      { name: "description", content: "TRADEON trading tournaments." },
      { property: "og:title", content: "Tournaments — TRADEON" },
      { property: "og:description", content: "TRADEON trading tournaments." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TournamentsPage,
});
