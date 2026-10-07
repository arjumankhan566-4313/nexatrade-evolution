import { createFileRoute } from "@tanstack/react-router";
import AdminLoginPage from "@/tradeon-client/pages/admin/AdminLoginPage";

export const Route = createFileRoute("/admin/login")({
  head: () => ({
    meta: [
      { title: "Admin sign in — TRADEON" },
      { name: "description", content: "TRADEON admin panel sign in." },
      { property: "og:title", content: "Admin sign in — TRADEON" },
      { property: "og:description", content: "TRADEON admin panel sign in." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminLoginPage,
});
