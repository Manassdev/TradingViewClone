# TradingView Clone — Backend & MongoDB Atlas Architecture

A modular Node.js + Express REST API server providing authentication, watchlists, alerts, community discussions, and market data proxy for the TradingView Clone web application.

---

## 1. System Architecture

```text
Frontend UI (React, Vite, React Router, Tailwind CSS)
        │
        ├── Direct Client Feed (Low Latency):
        │   └── Binance WebSockets (stream.binance.com) -> Live Candlestick Ticks
        │
        └── REST API Client (ApiClient in js/api.js):
                │
                ▼
        Node.js / Express Backend (http://localhost:5000)
        ├── CORS & Error Handling Middleware
        ├── JWT Authentication Middleware (Bearer Token)
        ├── Controllers (Auth, Watchlist, Alert, Comment, Market, Paper Trading)
        │
        ├── External Market Proxy:
        │   └── Binance REST API (api.binance.com) -> Historical Klines & 24hr Ticker
        ├── External News Proxy:
        │   └── GNews Search API -> Community News (in-memory cache; no database writes)
        │
        └── Database Layer (Mongoose ODM):
            └── MongoDB Atlas Cluster / Local Instance (Database: "tradingview")
                ├── users (Accounts & Passwords)
                ├── watchlist (User Ticker Lists)
                ├── alerts (Price Threshold Alarms)
                └── comments (Idea Community Discussions)
```

---

## 2. Directory Structure

```text
backend/
├── server.js                  # Main server entrypoint, routes mounting & CORS
├── package.json               # Dependencies & scripts (type: "module")
├── .env                       # Environment variables (git-ignored)
├── .env.example               # Environment variables template
├── .gitignore                 # Protects secrets & node_modules
│
├── config/
│   └── db.js                  # Reusable MongoDB / Atlas connection module
│
├── models/
│   ├── User.js                # Users collection schema
│   ├── Watchlist.js           # Watchlist collection schema
│   ├── Alert.js               # Alerts collection schema
│   └── Comment.js             # Comments collection schema
│
├── controllers/
│   ├── authController.js      # Register, login, getMe
│   ├── watchlistController.js # Get, add, remove watchlist symbols
│   ├── alertController.js     # CRUD for target price alerts
│   ├── commentController.js   # Get idea comments, post, delete
│   ├── marketController.js    # Binance REST proxy and generated ideas
│   └── newsController.js      # Validated GNews news endpoint
│
├── services/
│   ├── marketDataService.js   # Bounded Binance requests and short idea-response cache
│   ├── ideaGenerator.js       # Deterministic technical-analysis rules
│   └── newsService.js         # GNews requests, normalization, quota guard, and cache
│
├── routes/
│   ├── authRoutes.js          # /api/auth routes
│   ├── watchlistRoutes.js     # /api/watchlist routes
│   ├── alertRoutes.js         # /api/alerts routes
│   ├── commentRoutes.js       # /api/comments routes
│   ├── marketRoutes.js        # /api/market routes
│   └── newsRoutes.js          # /api/news route
│
└── middleware/
    ├── authMiddleware.js      # JWT protect & optionalAuth
    └── errorMiddleware.js     # 404 & centralized error handling
```

---

## 3. Environment Variables Configuration

Create a `.env` file in the `backend/` directory:

```env
PORT=5000
NODE_ENV=development

# For Local MongoDB (Default migrated instance):
MONGODB_URI=mongodb://127.0.0.1:27017/tradingview

# For MongoDB Atlas (Replace with your actual Atlas cluster connection string):
# MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/tradingview?retryWrites=true&w=majority

# Strong secret for signing JWT tokens
JWT_SECRET=<generate-a-unique-random-secret-of-at-least-32-characters>

# GNews API key (kept on the backend only)
GNEWS_API_KEY=<your-gnews-api-key>
```

> **Security Note:** `.env` is listed in `.gitignore` and must never be committed to source control or exposed to frontend client code.

---

## 4. How to Start the Server

```bash
# Navigate to backend directory
cd backend

# Install dependencies (if not already linked)
npm install

# Start development server with live watch
npm run dev

# Or start in standard production mode
npm start
```

Verify backend health by visiting:
```text
GET http://localhost:5000/api/health
```

Expected JSON response:
```json
{
  "status": "ok",
  "database": "connected",
  "databaseType": "Local MongoDB (migrated instance) / MongoDB Atlas",
  "databaseName": "tradingview",
  "collections": ["users", "watchlists", "alerts", "notifications", "comments", "paper_portfolios"]
}
```

The current workspace `.env` selects local MongoDB at `127.0.0.1:27017`. If startup reports that the local service is unreachable, install and start MongoDB Community Server (or set `MONGODB_URI` to an Atlas URI whose cluster is running and whose IP access list allows this machine). The backend does not substitute an in-memory database. Startup times out after five seconds by default and reports a configuration hint without printing the connection string. `MONGODB_CONNECT_TIMEOUT_MS` can be set from 1000 to 30000.

Environment variables are loaded from `backend/.env` regardless of the shell's current directory. Copy `.env.example` to `.env`, replace the JWT placeholder with a unique random secret of at least 32 characters, and set either a local `mongodb://` URI or an Atlas `mongodb+srv://` URI. Never commit `.env`.

---

## 5. REST API Documentation

### Forex market data (`/api/forex`)
Forex data uses Twelve Data's composite spot Forex quote and time-series endpoints. Set `TWELVE_DATA_API_KEY` in `backend/.env`; no key is bundled or sent to the browser. Without a key the API responds with an explicit configuration error, and the UI does not substitute sample rates. `FOREX_EXTRA_PAIRS` optionally adds comma-separated 6-letter symbols (for example `USDINR:US Dollar / Indian Rupee`). Each configured pair must also be available to the selected Twelve Data plan. The app identifies provider timestamps and stale data but cannot determine whether an account's entitlement is real-time or delayed; the UI says that delivery speed depends on the plan. Forex spot volume is not returned or synthesized. Bid/ask and spread are shown only if supplied by the provider. Quotes are composite market data and may not be executable broker prices.

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/forex/pairs` | Public | Standard majors/minors plus configured extra pairs and normalized pair metadata. |
| `GET` | `/api/forex/search?q=EUR` | Public | Search symbols, base/quote currencies, and pair names (40-character query maximum). |
| `GET` | `/api/forex/quotes?symbols=EURUSD,GBPUSD` | Public | 1–20 supported pairs; omitted symbols requests the seven majors. Includes per-symbol errors and provider-reported daily movers. |
| `GET` | `/api/forex/quotes/:symbol` | Public | One normalized provider quote. |
| `GET` | `/api/forex/candles/:symbol?interval=1h&limit=300` | Public | OHLC history; intervals are `1m`, `5m`, `15m`, `30m`, `1h`, `4h`, `1D`, `1W`, `1M`; limit is 10–500. No volume field is provided. |
| `GET` | `/api/forex/analytics/:symbol?period=1m&compare=GBPUSD` | Public | Period return/high/low, optional comparison, and documented major-pair currency-strength estimate. Periods: `1w`, `1m`, `3m`, `1y`. |

The backend caches quotes for 60 seconds and candles for five minutes; displayed quote staleness is marked after five minutes. Provider timeouts are bounded and retried once only for timeout/5xx failures. Provider rate-limit responses are passed through as HTTP 429 with `Retry-After`; observe the quota and symbol entitlements of your account. The currency-strength estimate averages provider daily percentage return contributions. For each quote currency it uses the mathematically inverted pair return, `-r / (1 + r)` (where `r` is the pair return as a decimal), and only reports currencies represented by at least two major pairs; it is not an official index.

#### Provider account and data-use notes
Create a Twelve Data account, create an API key, and add it to `backend/.env` as `TWELVE_DATA_API_KEY`. Restart the backend after changing the file. Plan availability, request credits, WebSocket limits, and display/redistribution rights depend on the account and intended use. The application uses REST quotes and OHLC history; it does not promise tick-level quotes or broker bid/ask. Review the [Twelve Data Forex API v2 support page](https://support.twelvedata.com/en/articles/12520817-forex-api-v2), [API documentation](https://twelvedata.com/docs), [trial limits](https://support.twelvedata.com/en/articles/5335783-trial), and [pricing and data-plan terms](https://twelvedata.com/pricing) before public or commercial display. Do not assume a free plan permits public display or redistribution.

Forex pairs can be saved to existing named watchlists as `assetType: "forex"`; stored symbols are normalized without slashes. Existing stock and crypto watchlist records remain valid. Forex alert creation and recurring quote evaluation are not enabled: automatic review blocked integrating the backend alert poller because it would repeatedly send the configured Twelve Data API key to a third party. Do not describe Forex alerts as operational until this specific integration has explicit authorization and provider-backed tests.

### Indian market data (`/api/india`)
India equities use the Twelve Data adapter and a local exchange-aware instrument registry. Requests always send both the provider symbol and its exact NSE/BSE exchange; provider metadata is checked when returned and there is no NSE-to-BSE fallback. The seeded registry includes the requested common NSE/BSE stocks and NIFTY 50, NIFTY Bank, and SENSEX as provider candidates. Unsupported symbols, index entitlements, or plans return clear errors and are never filled with sample prices. No India index is considered available until Twelve Data successfully returns a quote for that exact symbol/exchange.

Twelve Data currently lists India exchange feeds as end-of-day (EOD), not real-time. India access is shown on its Grow/Venture tiers for NSE and BSE; actual API entitlement still depends on the account. This application therefore enables only `1D`, `1W`, and `1M` candles for India; intraday controls are intentionally omitted. Quotes cache for 15 minutes and candles for one hour. Returned exchange-local naive timestamps are interpreted as `Asia/Kolkata` and normalized to UTC. Volume is included only when the provider returns it. Quotes older than five days are marked stale. Analytics use the configured NSE sample; gainers and losers sort provider-reported daily percentage change, most-active sorts provider-reported volume, and sector return is the unweighted mean of sample constituents rather than an official sector index. Public/commercial display rights depend on the selected data plan and exchange rules; confirm them with the provider before deployment.

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/india/instruments?exchange=NSE` | Public | Exchange-aware registry (NSE/BSE) with provider symbols and INR metadata. |
| `GET` | `/api/india/search?q=RELIANCE` | Public | Search companies, tickers, exchanges, and registered index names. |
| `GET` | `/api/india/quotes?symbols=NSE:RELIANCE,BSE:RELIANCE` | Public | Up to 20 exact registered instruments; includes per-symbol errors and EOD timestamp/source. |
| `GET` | `/api/india/quotes/:exchange/:symbol` | Public | One normalized provider quote for the exact listing. |
| `GET` | `/api/india/candles/:exchange/:symbol?interval=1D&limit=180` | Public | Provider OHLCV history; intervals: `1D`, `1W`, `1M`; limit 10–500. |
| `GET` | `/api/india/indices` | Public | Quotes for registered Indian index candidates; unsupported index candidates return errors. |
| `GET` | `/api/india/market-status` | Public | IST schedule state using weekdays and configured official holiday dates. |
| `GET` | `/api/india/analytics` | Public | NSE sample gainers/losers, provider-volume leaders, and explicitly labeled sample sector returns. |

Configure `TWELVE_DATA_API_KEY` in `backend/.env` using an account with India EOD exchange entitlements. Configure `INDIA_MARKET_HOLIDAYS` as a comma-separated, operator-maintained list of official `YYYY-MM-DD` NSE/BSE holidays, including the current year; if the list has no current-year date, weekday market status is `unknown`. Special sessions are not inferred. Check the official exchange calendar and replace the dates each year. India alerts are stored in the existing `alerts` collection and evaluated by the backend scheduler from new provider EOD quotes only after the configured regular session closes. They do not run intraday; they continue only while the backend is running and connected to MongoDB. Alert notifications use the existing `notifications` collection and unique alert/trigger key to avoid duplicates. Generic legacy `stock` alerts and Forex alerts remain unmonitored.

The provider adapter requires an actual eligible subscription for India exchange data. A key can authenticate successfully while lacking India EOD entitlement; in that case the UI reports the provider error and displays no price. The project does not cache or bundle credentials in React.

### Authentication (`/api/auth`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | Public | Register user with bcrypt password hash; limited to 5 requests per IP in 15 minutes. |
| `POST` | `/api/auth/login` | Public | Authenticates by email or username; limited to 10 requests per IP in 15 minutes. |
| `POST` | `/api/auth/logout` | Private | Increments the user's token version to invalidate existing JWTs. |
| `GET` | `/api/users/me` | Private | Returns current authenticated user profile (excluding password). |

### Watchlist (`/api/watchlist`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/watchlist` | Private | Retrieves the authenticated user's watchlist symbols from MongoDB. |
| `POST` | `/api/watchlist` | Private | Adds an asset to the selected or default watchlist. |
| `GET` | `/api/watchlist/lists` | Private | Lists the user's named watchlists and ordered assets. |
| `POST` | `/api/watchlist/lists` | Private | Creates a named watchlist (maximum 20 per user). |
| `PATCH` | `/api/watchlist/lists/:id` | Private | Renames an owned watchlist. |
| `DELETE` | `/api/watchlist/lists/:id` | Private | Deletes an owned watchlist. |
| `PUT` | `/api/watchlist/lists/:id/reorder` | Private | Reorders every item using its ID exactly once. |
| `DELETE`| `/api/watchlist/:id?listId=...` | Private | Removes an item from an owned list. |

### Alerts (`/api/alerts`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/alerts` | Private | Retrieves active price alerts for the authenticated user. |
| `POST` | `/api/alerts` | Private | Creates a price alert (`symbol`, `triggerCondition`, `targetValue`). |
| `PUT` | `/api/alerts/:id` | Private | Updates an alert's status (`isActive`, `targetValue`). |
| `DELETE`| `/api/alerts/:id` | Private | Deletes the specified alert (ownership verified). |

### Community Comments (`/api/comments`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/comments/:ideaId` | Public | Returns discussion comments for a specific idea setup. |
| `POST` | `/api/comments` | Private | Posts a new comment or reply for an idea setup. |
| `PATCH` | `/api/comments/:id` | Private | Edits an owned comment and records its edit time. |
| `DELETE`| `/api/comments/:id` | Private | Deletes a comment (ownership verified). |

### Market Proxy (`/api/market`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/market/klines` | Public | Proxies Binance historical candlestick data (`symbol`, `interval`, `limit`). |
| `GET` | `/api/market/ticker` | Public | Proxies Binance 24hr quote changes. |
| `GET` | `/api/market/ideas` | Public | Generates current cryptocurrency ideas from Binance tickers and completed hourly candles. |
| `GET` | `/api/market/status` | Public | Returns market classification metadata (Crypto: LIVE, Stocks/Indices: STATIC/MOCK). |

### Community News (`/api/news`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/news` | Public | Returns normalized, newest-first articles from GNews. Optional `category`: `all`, `cryptocurrency`, `stock_market`, `economy`, or `regulation`. |

The GNews API key is read only by the backend from `GNEWS_API_KEY`. The endpoint uses GNews Search with fixed, validated queries and English-language results. The `all` category combines four topic searches, deduplicates articles by canonical URL, and returns up to 40 results. Category results are cached in memory for two hours; overlapping same-category requests are coalesced and outbound requests are spaced to respect the Free plan's one-request-per-second limit. A process-local daily request guard caps provider traffic at 90 calls to leave room below the Free plan's 100-request daily allowance. News is not stored in MongoDB.

Each response includes `meta.retrievedAt`, which is the backend retrieval time. Each article's `publishedAt` is the publication time returned by GNews. The Free plan may delay article availability by up to 12 hours and returns at most 10 articles per search. The UI discloses this limitation.

Run backend checks with `npm test` from the `backend/` directory.

### Generated cryptocurrency ideas

`GET /api/market/ideas` analyzes BTCUSDT, ETHUSDT, BNBUSDT, SOLUSDT, and XRPUSDT. It does not write ideas to MongoDB. The response contains `success`, `data`, and `meta`. Each idea includes a stable ID, explicit signal `kind`, direction, current Binance price, 24-hour percentage change, explanation, generation time, price timestamp, and latest completed candle timestamp. It also includes the latest 24 completed hourly `chartData` closes for the Community Ideas card preview. `meta.unavailableSymbols` and `meta.insufficientSymbols` identify pairs that could not be analyzed fully. Partial market-data failures do not suppress ideas for healthy pairs.

The endpoint caches a successful result for 45 seconds and coalesces overlapping refreshes. Binance calls time out after 8 seconds; kline requests run with a maximum concurrency of three. A fully unavailable market response returns HTTP 503 with a `Retry-After` header.

The signal rules are deterministic and use completed 1-hour candles:

* Bullish crossover: the 9-candle SMA was at or below the 21-candle SMA on the preceding completed candle and is above it on the latest completed candle.
* Bearish crossover: the 9-candle SMA was at or above the 21-candle SMA on the preceding completed candle and is below it on the latest completed candle.
* Resistance breakout: latest completed close is above the highest high of the prior 20 completed candles.
* Support breakdown: latest completed close is below the lowest low of the prior 20 completed candles.
* Positive or negative momentum: Binance's 24-hour ticker change is at least +5% or at most -5%.

Moving-average ideas require at least 22 completed candles; breakout ideas require at least 21. Missing history produces no indicator signal. These examples are not guaranteed predictions or investment advice.

---

## 6. Database Collections Schema Specification

### Collections and features

| Collection | Purpose and application use |
|---|---|
| `users` | Accounts, unique email and case-insensitive username indexes, bcrypt `passwordHash`, display name, avatar, embedded preferences and token version for logout invalidation. |
| `watchlists` | One document per named list, owned by a user; ordered embedded symbols carry asset type, exchange, provider and display name. Unique owner/name index prevents duplicate names. |
| `watchlist` | Legacy collection retained for compatibility. On the first authenticated watchlist read, old symbols are imported into the user's default `watchlists` document. |
| `alerts` | User-owned price conditions, activation and trigger state. The monitor currently evaluates Binance crypto pairs; stock conditions are stored but are not monitored. |
| `notifications` | User-owned alert-trigger notifications, deduplicated by alert and trigger count; read state is updated through notification endpoints. |
| `comments` | Public idea discussions with author IDs, parent references, edit time and per-resource/per-author indexes. Create, edit and delete require authentication; edits and deletes require ownership. |
| `paper_portfolios` | One CAS-versioned document per user containing initial balance, cash, long crypto holdings, limit-order lifecycle, execution history and idempotency records. |

`userpreferences` is not a separate collection because the current profile settings are a small embedded object on `users`. `newsarticles` and `pricehistory` are not persisted: news is cached in memory and historical candle data comes from Binance. No `refreshTokens` collection is needed because logout increments a token version on the user; no audit-log collection is currently required by an administrative feature.

## React frontend and paper trading

Install the frontend dependencies once and start Vite from the project root:

```powershell
cd frontend
npm install
npm run dev
```

Vite proxies `/api` to the Express server at `http://localhost:5000`; set `VITE_BACKEND_ORIGIN` if the backend uses another origin. Run `npm run build` in `frontend/` to create a production build.

Paper trading is authenticated and simulated only. New accounts start with `PAPER_INITIAL_BALANCE` USDT (default 100,000; maximum 10,000,000). The portfolio, performance, market-order, limit-order, cancellation, and reset endpoints are scoped to the signed-in account. Order requests require an `Idempotency-Key` UUID. No real exchange orders are placed.

The simulator currently supports Binance USDT spot pairs only, long positions only, zero simulated commissions, and no margin. Market orders use a fresh server-side Binance last-trade quote at request time. Limit orders persist as pending and are evaluated against Binance last price whenever the authenticated portfolio is refreshed (the UI refreshes periodically); eligible buys require last price at or below the limit and eligible sells at or above it. A crossed limit fills at its limit price, conservatively, without claiming order-book price improvement. Pending buys reserve cash and pending sells reserve quantity. Pending limit orders can be cancelled; modification, stop/stop-limit, take-profit/stop-loss, partial fills, and short positions are not implemented. This is a smaller feature set than TradingView Paper Trading, which documents market, limit, stop and TP/SL workflows across asset classes. Existing portfolios without an `initialBalance` field use the historical 100,000 USDT baseline and acquire the field on reset; no destructive migration is needed.

Accounting uses fixed 8-decimal integer-scaled arithmetic in the trading service. Buys reduce cash by fill notional; sells add fill notional. Positions use weighted-average entry price. A sell realizes `(sell fill - average entry) * sold quantity`; unrealized P/L is `(mark - average entry) * open quantity`; equity is cash plus marked long-position value; total P/L is equity minus that account's initial balance. No fees are charged or subtracted. Available cash subtracts pending buy-limit reservations, and sellable quantity subtracts pending sell-limit reservations. Each account's balance, positions, orders, trades, and replay keys live in one versioned MongoDB document; compare-and-set updates serialize concurrent writes without a multi-document transaction. The order monitor runs every `PAPER_ORDER_CHECK_INTERVAL_MS` (default 15 seconds) and portfolio reads also evaluate pending limits. Because the feed is sampled, a brief crossing between checks can be missed.
