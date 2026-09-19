# Mushland Store

## Razorpay setup

1. Install Node.js LTS.
2. Run `npm install` in this folder.
3. Copy `.env.example` to `.env`.
4. From the Razorpay dashboard, copy your **Test Key ID** and **Test Key Secret** into `.env`.
5. Set a private `ADMIN_TOKEN` in `.env`.
6. Run `npm start`.
7. Open `http://localhost:3000`.

Use Razorpay Test Mode first. Never commit `.env` or expose `RAZORPAY_KEY_SECRET` in browser code.

The server validates the three rank prices itself:

- Mush Rank: INR 899
- Grand Rank: INR 599
- Apex Rank: INR 299

Payment verification is handled by `/api/verify-payment`. A production deployment should also persist verified orders and deliver the rank from a trusted server-side process.

Verified orders are saved in `orders.json` with status `paid_manual_fulfilment`. Open `http://localhost:3000/admin.html` and enter your `ADMIN_TOKEN` to review orders before granting ranks manually with LuckPerms.
