# TradingView Clone — Backend & MongoDB Atlas Architecture

A modular Node.js + Express REST API server providing authentication, watchlists, alerts, community discussions, and market data proxy for the TradingView Clone web application.

---

## 1. System Architecture

```text
Frontend UI (HTML5, CSS3, Vanilla ES6 JS)
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
        ├── Controllers (Auth, Watchlist, Alert, Comment, Market)
        │
        ├── External Market Proxy:
        │   └── Binance REST API (api.binance.com) -> Historical Klines & 24hr Ticker
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
│   └── marketController.js    # Binance REST proxy endpoints
│
├── routes/
│   ├── authRoutes.js          # /api/auth routes
│   ├── watchlistRoutes.js     # /api/watchlist routes
│   ├── alertRoutes.js         # /api/alerts routes
│   ├── commentRoutes.js       # /api/comments routes
│   └── marketRoutes.js        # /api/market routes
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
  "collections": ["users", "watchlist", "alerts", "comments"]
}
```

---

## 5. REST API Documentation

### Authentication (`/api/auth`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | Public | Register new user. Hashes password with bcrypt (10 rounds), initializes default watchlist in DB, returns JWT. |
| `POST` | `/api/auth/login` | Public | Authenticates user (supports both email and username), verifies bcrypt hash, returns JWT. |
| `GET` | `/api/users/me` | Private | Returns current authenticated user profile (excluding password). |

### Watchlist (`/api/watchlist`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/watchlist` | Private | Retrieves the authenticated user's watchlist symbols from MongoDB. |
| `POST` | `/api/watchlist` | Private | Adds symbol(s) to the authenticated user's watchlist. |
| `DELETE`| `/api/watchlist/:id` | Private | Removes symbol from the user's watchlist. |

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
| `DELETE`| `/api/comments/:id` | Private | Deletes a comment (ownership verified). |

### Market Proxy (`/api/market`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/market/klines` | Public | Proxies Binance historical candlestick data (`symbol`, `interval`, `limit`). |
| `GET` | `/api/market/ticker` | Public | Proxies Binance 24hr quote changes. |
| `GET` | `/api/market/status` | Public | Returns market classification metadata (Crypto: LIVE, Stocks/Indices: STATIC/MOCK). |

---

## 6. Database Collections Schema Specification

### Collection: `users`
```json
{
  "_id": "ObjectId",
  "name": "String (e.g. Test User)",
  "username": "String (e.g. testuser)",
  "email": "String (unique, lowercase)",
  "password": "String (bcrypt hashed)",
  "avatar": "String (default: user)",
  "createdAt": "ISODate"
}
```

### Collection: `watchlist`
```json
{
  "_id": "ObjectId",
  "userId": "Mixed (ObjectId or String)",
  "name": "String (e.g. My Watchlist)",
  "symbols": ["AAPL", "TSLA", "NVDA", "MSFT", "AMZN", "BTCUSDT"],
  "updatedAt": "ISODate"
}
```

### Collection: `alerts`
```json
{
  "_id": "ObjectId",
  "userId": "Mixed (ObjectId or String)",
  "symbol": "String (e.g. AAPL)",
  "triggerCondition": "String (greater_than, less_than, above, below)",
  "targetValue": 250,
  "isActive": true,
  "isTriggered": false,
  "notificationType": ["email", "in-app"],
  "createdAt": "ISODate"
}
```

### Collection: `comments`
```json
{
  "_id": "ObjectId",
  "ideaId": "Mixed (ObjectId or String slug)",
  "userId": "Mixed (ObjectId or String)",
  "userName": "String",
  "content": "String",
  "parentCommentId": "Mixed (ObjectId or null)",
  "createdAt": "ISODate"
}
```
