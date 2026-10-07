import { createFileRoute, Link } from "@tanstack/react-router";
import TradeonLogo from "../apex/components/TradeonLogo";

export const Route = createFileRoute("/chart")({
  head: () => ({
    meta: [
      { title: "Trade — TRADEON" },
      { name: "description", content: "The TRADEON trading terminal." },
      { property: "og:title", content: "Trade — TRADEON" },
      { property: "og:description", content: "The TRADEON trading terminal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChartPage,
});

function ChartPage() {
  return (
    <div className="apex-space flex min-h-screen flex-col items-center justify-center px-4 font-apex text-apex-ink">
      <Link to="/" aria-label="TRADEON home" className="apex-focusable rounded-xl">
        <TradeonLogo variant="nav" />
      </Link>
      <div className="apex-glass apex-hairline mt-8 w-full max-w-sm p-8 text-center">
        <h1 className="text-xl font-semibold">Trading terminal</h1>
        <p className="mt-3 text-sm leading-relaxed text-apex-muted">
          The live trading terminal is being moved into this app. It will be available here
          shortly.
        </p>
        <Link
          to="/"
          className="apex-btn apex-btn--ghost apex-focusable mt-6 px-5 py-2.5 text-[13px]"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
