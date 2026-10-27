# TradingView Clone frontend migration map

## Inventory baseline

- The legacy frontend is six standalone HTML pages (`index.html`, `idea.html`, `signin.html`, `signup.html`, `features.html`, and `pricing.html`) backed by modular global JavaScript in `js/` and CSS modules imported by `styles.css`.
- `index.html` is the main trading terminal. It contains the shared header, home/hero, market summary, Community Ideas and Community News feeds, crypto overview, chart workspace, watchlist, order ticket, portfolio, notifications, and profile panels. Its existing in-page routes are `#/home`, `#/markets/crypto`, and `#/chart?symbol=...`.
- `idea.html` is a separate idea detail and discussion page. Dynamic Community Ideas are supplied by `GET /api/market/ideas`, with charts from Binance candle data and comments from `/api/comments`.
- `signin.html` and `signup.html` use the existing email/password API. Google sign-in is only a placeholder and must remain clearly unavailable until OAuth is configured.
- `features.html` and `pricing.html` are standalone marketing pages with their own presentation styles and shared header patterns.
- `js/chart-engine.js` wraps Lightweight Charts and Binance live market streams. Other legacy modules manage UI, watchlists, orders, alerts, news, auth, and comments through global state (`AppState`, `App`, and `ApiClient`).
- `styles.css` imports `css/variables.css`, `header.css`, `home.css`, `overview.css`, `terminal.css`, `sidebar.css`, and `components.css`. Standalone page styles live in `css/auth-page.css`, `features.css`, and `pricing.css`.
- The Express application in `backend/` owns authentication, MongoDB-backed users/watchlists/alerts/comments/notifications, Binance market proxy and ideas, and GNews news. The existing backend environment validation and MongoDB connection remain in place.
- The current working tree already contains uncommitted Community Ideas and Community News work. Those changes are part of the baseline and must be retained.

## Route and page mapping

| Current page or route | React route | Main React composition |
| --- | --- | --- |
| `index.html` / `#/home` | `/` | `AppShell`, `Navbar`, home hero, market strip, Community Ideas, Community News, footer |
| `#/markets/crypto` | `/markets/crypto` | Shared shell, crypto market overview and market summary |
| `#/chart?symbol=BTCUSDT` | `/chart/:symbol` | Shared shell, chart workspace, symbol/timeframe controls, watchlist, alerts, trading panels |
| `idea.html?id=...` | `/ideas/:id` | Idea detail, real chart data, existing comments API |
| `signin.html` | `/signin` | Email login form backed by existing auth API |
| `signup.html` | `/signup` | Email registration backed by existing auth API |
| `features.html` | `/features` | Features marketing page |
| `pricing.html` | `/pricing` | Pricing marketing page |
| New paper trading workspace | `/paper-trading` | Auth-protected portfolio, order panel, holdings, trade history, performance chart |

## Integration and data ownership

- Keep `backend/` as the API and database owner. Configure Vite to proxy `/api` to the existing Express server; the browser uses same-origin relative API paths in development and production.
- Add a React API client that sends existing JWT bearer tokens for protected calls. Preserve login, registration, logout, session restoration, and server-side token revocation behavior.
- Reuse the real data sources: Binance REST/WebSocket for market data and ideas, GNews through the backend for news, and MongoDB-backed APIs for authenticated user data. Do not add mocked replacements for live API-backed sections.
- React components own the rendered DOM and page lifecycle. Reuse CSS tokens and the Lightweight Charts dependency where appropriate, and wrap the chart engine with React lifecycle cleanup so chart instances and WebSockets do not outlive their route.
- Keep old HTML, CSS, and JavaScript files in place during the migration. Do not remove the legacy frontend until every route and integration is verified.

## Paper trading plan

- Add an authenticated paper-trading API and a MongoDB portfolio document scoped to `req.user.id`; do not accept a user ID, wallet balance, or execution price from the client.
- Use current server-fetched Binance prices for market orders. Store cash, holdings, average entry, realized P/L, and trade records per user.
- Use an atomic single-document compare-and-swap update with a portfolio version and per-order idempotency key to prevent overspending, overselling, and duplicate execution without requiring MongoDB replica-set transactions.
- Expose portfolio read, market execution, reset, and performance-history endpoints. Keep the simulated initial balance at 100,000 USDT and make reset a confirmed user action.

## Verification gates

1. Keep the legacy app and compare its existing API behavior before changing entry points.
2. Build and run the React app alongside the existing backend; check all routes, responsive layouts, charts, ideas, news, auth, watchlist, alerts, and comments against real API responses.
3. Verify paper trading validation, price sourcing, atomic updates, idempotency, holdings/P&L, and reset behavior.
4. Run the existing backend tests, additional tests for new routes/services, JavaScript syntax checks, and the Vite production build.
5. Retain the legacy files until the user can launch the React frontend and the verification gates pass.
