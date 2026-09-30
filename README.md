# TradingView Clone

This project keeps the existing plain HTML/CSS/JavaScript frontend. Express serves it and its same-origin `/api` backend. Binance market data remains in the browser on its existing REST and WebSocket feeds. Account data uses MongoDB Atlas through Mongoose.

## Create and configure Atlas

Atlas cluster creation must be done in your Atlas dashboard; this repository cannot create resources in your account.

1. In MongoDB Atlas, create a cluster (the free tier is sufficient for development).
2. Under **Database Access**, create a database user with read/write access to the `tradingview` database. This database user is separate from users who sign up in the app.
3. Under **Network Access**, add your current IP address. Avoid opening access to every IP address unless you understand the risk.
4. Select **Connect → Drivers**, copy the Node.js connection URI, and replace the username, password, and cluster host placeholders in the local `.env` file. Percent-encode URI-reserved characters in the database user's password. Keep the URI private.

The app requires an Atlas SRV URI (`mongodb+srv://…mongodb.net`). It sets the database name to `tradingview` itself, regardless of the URI path.

## Local setup

Requirements: Node.js 18+ and the Atlas cluster configured above.

```powershell
Copy-Item .env.example .env
```

Edit `.env` and set `MONGODB_URI`, a private `JWT_SECRET` of at least 32 characters, and the browser origin in `CLIENT_ORIGIN`. Generate a secret locally with:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Keep that output private. Do not commit `.env` or paste its contents into support messages.

Then run:

```powershell
npm install
npm run db:init
npm start
```

`db:init` is safe to rerun. It creates and then verifies the required collections and indexes, adds validators where missing, and preserves existing collection validators, indexes, and records. Server startup also runs the same idempotent initializer before opening the HTTP port. `/api/health` returns HTTP 200 only while Mongoose is connected.

Open `http://localhost:3000`. The app uses secure signup/login and has no demo-password or mock Google authentication. Legacy browser account keys are not read or written by the new app. Theme and chart drawings remain local. Paper trading only changes virtual balances and holdings; no exchange order API is called.

## Collections and API

| Collection | Mongoose model | Purpose |
| --- | --- | --- |
| `users` | `User` | Account identity and bcrypt password hash |
| `watchlist` | `Watchlist` | Per-user symbols and favorites |
| `alertss` | `Alert` | Per-user price alerts |
| `portfolios` | `Portfolio` | Simulated cash and holdings |
| `orders` | `Order` | Simulated paper orders |
| `transactions` | `Transaction` | Paper trade ledger |

Authenticated endpoints use `Authorization: Bearer <token>`:

- `POST /api/auth/signup`, `POST /api/auth/login`, `GET /api/auth/me`
- `PATCH /api/auth/me` (avatar), `PATCH /api/auth/password` (requires current password)
- `GET/PUT /api/watchlist`
- `GET/POST /api/alerts`, `DELETE /api/alerts/:id`
- `GET /api/portfolio`, `GET /api/portfolio/orders`, `POST /api/portfolio/orders`

## Tests

Run `npm test` for local HTTP smoke tests, Atlas URI enforcement, and model/collection mapping checks. The Atlas integration test is skipped unless `MONGODB_TEST_URI` is set. Point it at a separate Atlas test cluster or database; the test refuses database names other than `tradingview_test` or `tradingview_test_*`. It creates random fixture accounts and removes only those fixtures afterward. It leaves test collections and indexes in place.

PowerShell example for the optional integration test:

```powershell
$env:MONGODB_TEST_URI = "<your-private-Atlas-SRV-URI>"
$env:MONGODB_TEST_DB = "tradingview_test"
npm test
Remove-Item Env:MONGODB_TEST_URI
Remove-Item Env:MONGODB_TEST_DB
```

Do not use the production `tradingview` database for integration tests.
