import { createFileRoute } from "@tanstack/react-router";
import SupportChatPage from "@/tradeon-client/pages/dashboard/SupportChatPage";

export const Route = createFileRoute("/dashboard/chat")({
  head: () => ({
    meta: [
      { title: "Support — TRADEON" },
      { name: "description", content: "TRADEON support chat." },
      { property: "og:title", content: "Support — TRADEON" },
      { property: "og:description", content: "TRADEON support chat." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SupportChatPage,
});
