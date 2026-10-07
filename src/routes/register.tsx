import { createFileRoute } from "@tanstack/react-router";
import RegisterPage from "@/tradeon-client/pages/RegisterPage";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Create account — TRADEON" },
      { name: "description", content: "Create your TRADEON trading account." },
      { property: "og:title", content: "Create account — TRADEON" },
      { property: "og:description", content: "Create your TRADEON trading account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RegisterPage,
});
