import { createFileRoute } from "@tanstack/react-router";
import ApexLandingPage from "../apex/pages/ApexLandingPage";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TRADEON — Smart Trading. Always On." },
      {
        name: "description",
        content:
          "Institutional-grade OTC trading, without the noise. A trading surface built for clarity: spatial glass interface, provable fairness, and live system metrics.",
      },
      { property: "og:title", content: "TRADEON — Smart Trading. Always On." },
      {
        property: "og:description",
        content:
          "Institutional-grade OTC trading, without the noise. Spatial glass interface, provable fairness, live system metrics.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap",
      },
      { rel: "icon", type: "image/png", href: "/brand/tradeon-mark.png" },
    ],
  }),
  component: Index,
});

function Index() {
  return <ApexLandingPage />;
}
