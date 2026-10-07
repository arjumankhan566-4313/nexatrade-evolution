# NexaTrade — সহজ সেটআপ গাইড (কোনো কোড লাগবে না)

এই গাইডটি যারা **কোড জানেন না** তাদের জন্য। শুধু নিচের ধাপগুলো অনুসরণ করুন।

---

## ১. ডোমেইন / ওয়েবসাইটের ঠিকানা — কিছু করতে হবে না ✅

NexaTrade এখন **নিজে থেকেই আপনার লাইভ ডোমেইন চিনে নেয়**:

- এখন আপনি **ফ্রি `*.vercel.app`** ডোমেইন ব্যবহার করছেন → canonical, sitemap, robots,
  Open Graph (শেয়ার কার্ড), JSON-LD, পেমেন্ট webhook — সব **নিজে থেকেই ঠিক হবে**।
- ভবিষ্যতে যখন আপনার **নিজের কাস্টম ডোমেইন** (যেমন `nexatrade.app`) যোগ করবেন
  (Vercel → Project → Settings → Domains), তখনও **কোনো কোড বদলানোর দরকার নেই**,
  কোনো env বদলানোরও দরকার নেই — সব আপনাআপনি নতুন ডোমেইন ধরে নেবে।

> `NEXT_PUBLIC_SITE_URL` ফেলে রাখুন **খালি**। শুধু তখনই সেট করুন যখন চান সব ডোমেইনে
> একটা নির্দিষ্ট ক্যানোনিকাল ডোমেইন জোর করে দেখাতে (যেমন `https://nexatrade.app`)।

---

## ২. Vercel-এ env ভেরিয়েবল সেট করা (Settings → Environment Variables)

| ভেরিয়েবল | কেন দরকার | কোথায় পাবেন |
|---|---|---|
| `DATABASE_URL` | সব ডেটা সংরক্ষণ (লগইন, টাকা, ট্রেড) | Neon / Supabase থেকে connection string |
| `JWT_SECRET` | লগইন সেশন সুরক্ষিত (random ৩২+ অক্ষর) | নিচের জেনারেটর ব্যবহার করুন |
| `NEXT_PUBLIC_GA_ID` | Google Analytics (দর্শক পরিসংখ্যান) | Google Analytics → `G-XXXXXXX` |
| `NEXT_PUBLIC_FB_PIXEL_ID` | Facebook/Meta Pixel বিজ্ঞাপন ট্র্যাকিং | Facebook Events Manager → Pixel ID |
| `NEXT_PUBLIC_TIKTOK_PIXEL_ID` | TikTok Pixel বিজ্ঞাপন | TikTok Ads → Pixel ID |
| `NOWPAYMENTS_API_KEY` | **অটোমেটিক ক্রিপ্টো ডিপোজিট** (সার্ভার, secret) | nowpayments.io → Account → API |
| `NOWPAYMENTS_IPN_SECRET` | পেমেন্ট নিশ্চিত হওয়ার webhook সিক্রেট | nowpayments.io → IPN settings |

> `NEXT_PUBLIC_` দিয়ে শুরু ভেরিয়েবলগুলো পাবলিক (ব্রাউজারে দেখা যাবে — গোপন নয়)।
> বাকিগুলো (`DATABASE_URL`, `JWT_SECRET`, `NOWPAYMENTS_*`) **secret — কাউকে দেখাবেন না**।

**JWT_SECRET বানাতে** (ঐচ্ছিক) — যেকোনো লম্বা random লেখা দিলেই চলবে, যেমন:
`nexa-2026-Xk9mPq4LzV8nRw3Tb7Yh2JdF6GcA5`

---

## ৩. গুগল সার্চ কনসোল (SEO)

- Google verification meta ট্যাগ **কোডেই বসানো আছে** (`YCVVDjS4…ctPI`), তাই ডিপ্লয়
  করলেই গুগল সেটি পাবে।
- Vercel-এ ডিপ্লয়ের পর:
  1. [Google Search Console](https://search.google.com/search-console) খুলুন
  2. আপনার লাইভ ডোমেইন/vercel.app URL দিয়ে property যাচাই করুন
  3. **Sitemaps** → `https://আপনার-ডোমেইন/sitemap.xml` সাবমিট করুন
- কাস্টম ডোমেইনে গেলে সেখানেও একই sitemap (`/sitemap.xml`) সাবমিট করবেন — সাইটম্যাপ
  নিজে থেকেই সেই ডোমেইনের URL দেখাবে।

---

## ৪. অটো ক্রিপ্টো ডিপোজিট (NOWPayments) চালু করতে

1. [nowpayments.io](https://nowpayments.io) — অ্যাকাউন্ট খুলুন ও লগইন করুন।
2. **Account → Store Settings / API** থেকে `API Key` কপি করুন → Vercel-এ `NOWPAYMENTS_API_KEY`।
3. **IPN / Webhook** সিক্রেট কপি করুন → Vercel-এ `NOWPAYMENTS_IPN_SECRET`।
4. IPN callback URL হিসেবে দিন (আপনার লাইভ ডোমেইন অনুযায়ী — নিজে থেকেও তৈরি হয়):
   ```
   https://আপনার-ডোমেইন/api/payments/webhook
   ```
   (এখন vercel.app হলে `https://আপনার-প্রজেক্ট.vercel.app/api/payments/webhook`)
5. Vercel-এ সেভ করে **Redeploy** দিন। ওয়ালেটে **⚡ Automatic** মোড চলে আসবে।

> **নিরাপত্তা নোট (গুরুত্বপূর্ণ):** যতক্ষণ `NOWPAYMENTS_API_KEY` সেট না থাকে, ওয়ালেটে **ডেমো চেকআউট** দেখায় (সিমুলেটেড পেমেন্ট — শুধু প্রিভিউ/টেস্টিংয়ের জন্য, UI-তে "Demo gateway is active" লেখা থাকে)। রিয়েল `NOWPAYMENTS_API_KEY` সেট করার **সাথে সাথেই ডেমো সার্ভার-সাইডে পুরোপুরি বন্ধ** হয়ে যায় — ডেমো চেকআউট আর খোলে না, আর `/api/payments/demo-charge` HTTP 403 (`DEMO_DISABLED`) দেয়। ফলে রিয়েল গেটওয়ে চলাকালে ডেমো দিয়ে কখনোই ব্যালান্স ক্রেডিট করা সম্ভব নয়। চাইলে কী ছাড়াও ডেমো বন্ধ রাখতে পারেন: `DISABLE_DEMO_GATEWAY=1`।

> **এডমিন রানটাইম কন্ট্রোল:** Admin → **Finance → ⚡ Gateway config** পেজ থেকে এখন দুটি সুইচ আছে — **Automatic deposits** (পুরো ⚡ Automatic ট্যাবের মাস্টার সুইচ, লাইভ ও ডেমো দুটোই) এবং **Demo checkout**। এখান থেকে বন্ধ করলে **সাথে সাথে পুরো সাইটে** বন্ধ হয়ে যায় (ডিপ্লয়/রিস্টার্ট লাগে না): ব্যবহারকারীর ওয়ালেটে AUTO ট্যাব অকার্যকর হয়ে যায়, `create-invoice` ডেমো টোকেন দেয় না, আর `demo-charge` চার্জে 403/503 দেয়। শুধু ম্যানুয়াল ডিপোজিট চালু থাকে। (লাইভ কী থাকলে ডেমো সুইচ লকড থাকে — ডেমো কখনো লাইভের পাশে চালানো যায় না।)

> কোনো key না থাকলে "Manual" ডিপোজিট (bKash/Nagad/Bank/USDT + স্ক্রিনশট) আগের মতোই
> কাজ করে — কিছু ভাঙবে না।

---

## ৫. ভাষা ও শেয়ার

- ল্যান্ডিং পেজের উপরে ডান কোণে **EN / বাংলা** টগল আছে — চাপলেই পেজ বাংলায় বদলে যায়,
  পছন্দ ব্রাউজারে মনে থাকে।
- CTA সেকশনে **শেয়ার বাটন** (Facebook, X, Telegram, WhatsApp, LinkedIn) আছে —
  এক ক্লিকেই বন্ধুদের কাছে NexaTrade শেয়ার করা যায়।

---

কোনো সমস্যা হলে: **arjumankhan181@gmail.com**
