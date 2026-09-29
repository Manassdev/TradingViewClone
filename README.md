# TradingView Clone

The existing plain HTML/CSS/JavaScript app is served by the Express process. Binance market data continues to use the browser's existing public REST and WebSocket connections; account data uses the same-origin `/api` routes.

## Requirements

- Node.js 18 or newer
- MongoDB running locally or a MongoDB connection URI

## Setup

1. Install packages: `npm install`
2. Copy `.env.example` to `.env` and set `MONGODB_URI`, a private `JWT_SECRET` of at least 32 characters, and `CLIENT_ORIGIN` for the browser origin. For local use the example values work if MongoDB is listening on localhost.
3. Start the app: `npm start`
4. Open `http://localhost:3000`. The health endpoint is `http://localhost:3000/api/health` and reports unavailable until MongoDB is connected.

In PowerShell, copy the environment template with `Copy-Item .env.example .env`. Do not commit `.env` or share the JWT secret. The app does not use the old demo credentials or mock Google login; create an account through Sign up.

## API

- `POST /api/auth/signup`, `POST /api/auth/login`, `GET /api/auth/me`
- `PATCH /api/auth/me` for avatar, `PATCH /api/auth/password` requiring the current password
- `GET/PUT /api/watchlist`
- `GET/POST /api/alerts`, `DELETE /api/alerts/:id`
- `GET /api/portfolio`, `POST /api/portfolio/orders`

Authenticated routes require `Authorization: Bearer <token>`. Each account owns its watchlist, alerts, portfolio, and transactions. Paper orders only update virtual balances and holdings; no exchange order endpoint is present. Comments are not persisted because the current idea UI contains static demo content and no comment submission flow.

## Checks

Run `npm test` for the HTTP smoke tests. These cover frontend/API serving, health reporting, unauthenticated access rejection, invalid signup input, and backend file exposure. Full account persistence requires a reachable MongoDB instance.
