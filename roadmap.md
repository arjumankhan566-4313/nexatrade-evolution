# TRADEON → Lovable Migration Roadmap

Goal: move the whole TRADEON platform (platform-v2) into this Lovable project so everything previews here.

- [x] Legacy Next.js app deleted from repo; DB schema + catalog ported to platform-v2 (done earlier, pushed to GitHub)
- [x] Database schema (30+ tables) live in Lovable Cloud database
- [ ] Phase 1: Apex landing page (TRADEON design, unchanged) as the Lovable home page — IN PROGRESS
- [ ] Phase 2: Auth (login/register) against the existing database
- [ ] Phase 3: Trading screen (chart, trade panel, OTC market data via server routes)
- [ ] Phase 4: Dashboard, wallet, KYC, referrals
- [ ] Phase 5: Admin panel
- [ ] Phase 6: OTC engine as Lovable server-side worker/cron replacement for Socket.io
