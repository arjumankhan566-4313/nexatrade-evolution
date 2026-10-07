import { createFileRoute } from "@tanstack/react-router";
import AdminKycPage from "@/tradeon-client/pages/admin/AdminKycPage";

export const Route = createFileRoute("/admin/_authed/kyc")({
  head: () => ({
    meta: [
      { title: "Admin KYC — TRADEON" },
      { name: "description", content: "Review TRADEON identity verifications." },
      { property: "og:title", content: "Admin KYC — TRADEON" },
      { property: "og:description", content: "Review TRADEON identity verifications." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminKycPage,
});
