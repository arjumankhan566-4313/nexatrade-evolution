import { createFileRoute } from "@tanstack/react-router";
import KycPage from "@/tradeon-client/pages/dashboard/KycPage";

export const Route = createFileRoute("/dashboard/kyc")({
  head: () => ({
    meta: [
      { title: "Verification — TRADEON" },
      { name: "description", content: "TRADEON identity verification." },
      { property: "og:title", content: "Verification — TRADEON" },
      { property: "og:description", content: "TRADEON identity verification." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: KycPage,
});
