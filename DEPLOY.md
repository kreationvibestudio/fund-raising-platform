# Deploy notes (Render)

## Wrong site on `*.onrender.com`

Each Render **Web Service** has its own URL. If you open `https://fund-raising-platform.onrender.com` and see an old “Fundraising Dashboard” (blue header, `$0`, `Donate $100`), that service is **not** connected to this repository, or it uses a different **Root Directory** / **Build Command**.

Fix:

1. In Render, open the service that should run this app.
2. **Settings → Build & Deploy**: connect repo `kreationvibestudio/fund-raising-platform`, branch `main`, root `/`, build `npm install && npm run build`, start `npm run start`.
3. Use the **exact** URL shown on that service’s dashboard (e.g. `https://fund-raising-platform-xxxx.onrender.com`).
4. Update `NEXT_PUBLIC_CAMPAIGN_URL` and Paystack **callback / webhook** URLs to match that hostname.

## Paystack opens the Paystack homepage

That happens when the **public key** is missing in the environment the browser sees, and the app used to fall back to opening `https://paystack.com`.

Ensure on Render:

- `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` = your `pk_live_…` or `pk_test_…`
- After adding or changing it: **Clear build cache & deploy** (Next inlines `NEXT_PUBLIC_*` at build time; the app also loads keys at runtime from `/api/public-env`).

Optional fallback:

- `NEXT_PUBLIC_PAYSTACK_DONATE_URL` = your hosted page `https://paystack.com/pay/...` (must contain `/pay/`).

## Manual donations (admin only)

Recording a **manual** donation (bank/offline) requires server env **`ADMIN_MANUAL_SECRET`** (long random string). On the site, expand **Admin — manual / offline donation**, enter that secret, then submit. Without a valid secret, `POST /api/donations` with `source: manual` returns **401**.
