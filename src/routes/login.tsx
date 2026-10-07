import { createFileRoute } from "@tanstack/react-router";
import LoginPage from "@/tradeon-client/pages/LoginPage";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — TRADEON" },
      { name: "description", content: "Sign in to your TRADEON trading account." },
      { property: "og:title", content: "Sign in — TRADEON" },
      { property: "og:description", content: "Sign in to your TRADEON trading account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoginPage,
});
