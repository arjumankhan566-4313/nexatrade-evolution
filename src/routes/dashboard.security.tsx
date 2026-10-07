import { createFileRoute } from "@tanstack/react-router";
import SecurityPage from "@/tradeon-client/pages/dashboard/SecurityPage";

export const Route = createFileRoute("/dashboard/security")({
  head: () => ({
    meta: [
      { title: "Security — TRADEON" },
      { name: "description", content: "TRADEON account security settings." },
      { property: "og:title", content: "Security — TRADEON" },
      { property: "og:description", content: "TRADEON account security settings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SecurityPage,
});
