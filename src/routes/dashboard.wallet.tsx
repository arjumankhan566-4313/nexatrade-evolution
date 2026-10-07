import { createFileRoute } from "@tanstack/react-router";
import WalletPage from "@/tradeon-client/pages/dashboard/WalletPage";

export const Route = createFileRoute("/dashboard/wallet")({
  head: () => ({
    meta: [
      { title: "Wallet — TRADEON" },
      { name: "description", content: "Your TRADEON wallet: deposits and withdrawals." },
      { property: "og:title", content: "Wallet — TRADEON" },
      { property: "og:description", content: "Your TRADEON wallet: deposits and withdrawals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WalletPage,
});
