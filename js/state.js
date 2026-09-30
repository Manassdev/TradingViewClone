/* Application Database State and LocalStorage sync logic */

window.AppState = {
  theme: 'dark',
  activeSymbol: 'BTCUSDT',
  activeTimeframe: '1h',
  activeTab: 'watchlist',
  activeView: 'home', // home, chart, markets-crypto
  activeOverviewTab: 'crypto', // crypto, stocks, indices
  user: null, // Logged in user details
  watchlist: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'ADAUSDT', 'XRPUSDT'],
  favorites: [],
  watchlistFilter: 'all', // all, favorites
  portfolio: {
    balance: 100000.00,
    holdings: [], // { symbol, qty, avgPrice }
    transactions: [] // { id, symbol, type, qty, price, total, time }
  },
  alerts: [], // { id, symbol, condition, target, active: true }
  tradeSide: 'BUY', // BUY, SELL
  orderType: 'MARKET', // MARKET, LIMIT
  livePrices: {}, // Real-time symbol quotes
  activeDropdownId: null,
  activeConfigIndicator: null, // ma, ema, bb, rsi
  
  // Available symbols for search auto-suggestions
  assetList: [
    { symbol: 'BTCUSDT', name: 'Bitcoin', desc: 'Bitcoin is the pioneer decentralized digital asset.' },
    { symbol: 'ETHUSDT', name: 'Ethereum', desc: 'Ethereum is a global decentralized software platform.' },
    { symbol: 'SOLUSDT', name: 'Solana', desc: 'Solana is a high-speed L1 blockchain network.' },
    { symbol: 'BNBUSDT', name: 'BNB', desc: 'BNB powers the decentralized BNB Chain ecosystem.' },
    { symbol: 'ADAUSDT', name: 'Cardano', desc: 'Cardano is a research-first smart contract L1.' },
    { symbol: 'XRPUSDT', name: 'Ripple', desc: 'XRP facilitates borderless global settlements.' },
    { symbol: 'DOGEUSDT', name: 'Dogecoin', desc: 'Dogecoin is the original community-driven meme coin.' },
    { symbol: 'DOTUSDT', name: 'Polkadot', desc: 'Polkadot enables cross-chain interoperability.' },
    { symbol: 'MATICUSDT', name: 'Polygon', desc: 'Polygon is an Ethereum Layer-2 scaling network.' },
    { symbol: 'LINKUSDT', name: 'Chainlink', desc: 'Chainlink is a decentralized oracle oracle framework.' },
    { symbol: 'LTCUSDT', name: 'Litecoin', desc: 'Litecoin is a peer-to-peer cryptocurrency.' },
    { symbol: 'SHIBUSDT', name: 'Shiba Inu', desc: 'Shiba Inu is an Ethereum-based token.' }
  ],

  stockList: [
    { symbol: 'AAPL', name: 'Apple Inc.', price: 189.84, change: 1.24 },
    { symbol: 'MSFT', name: 'Microsoft Corp.', price: 421.90, change: -0.45 },
    { symbol: 'GOOGL', name: 'Alphabet Inc.', price: 172.50, change: 2.10 },
    { symbol: 'TSLA', name: 'Tesla Inc.', price: 177.46, change: -3.80 },
    { symbol: 'NVDA', name: 'NVIDIA Corp.', price: 875.12, change: 4.65 },
    { symbol: 'AMZN', name: 'Amazon.com Inc.', price: 185.50, change: 0.85 }
  ],
  
  indexList: [
    { symbol: 'SPX', name: 'S&P 500 Index', price: 5222.68, change: 0.16 },
    { symbol: 'DJI', name: 'Dow Jones Industrial', price: 39512.84, change: 0.32 },
    { symbol: 'IXIC', name: 'Nasdaq Composite', price: 16340.87, change: -0.03 },
    { symbol: 'UK100', name: 'FTSE 100 Index', price: 8433.76, change: 0.63 },
    { symbol: 'DAX', name: 'DAX Performance Index', price: 18750.40, change: -0.12 },
    { symbol: 'NI225', name: 'Nikkei 225 Index', price: 38229.11, change: 1.48 }
  ]
};

// Static News database
window.NEWS_DATA = [
  { id: 1, category: 'crypto', source: 'CoinDesk', title: 'Bitcoin Holds $65K Support as Inflows Continue', time: '10m ago', desc: 'Institutional inflows into spot ETFs show steady strength.' },
  { id: 2, category: 'crypto', source: 'Bloomberg', title: 'Ethereum Gas Fees Bottom as L2 Scaling Surges', time: '30m ago', desc: 'Average transaction costs on Ethereum hit multi-year lows.' },
  { id: 3, category: 'macro', source: 'Reuters', title: 'Powell Signals Rate Adjustments May Begin in Autumn', time: '1h ago', desc: 'Federal Reserve Chairman hints inflation cooling targets are being met.' },
  { id: 4, category: 'crypto', source: 'TechCrunch', title: 'Solana Active Wallets Hit Multi-Month Highs', time: '2h ago', desc: 'DEX trading volume on Solana rivals Ethereum in recent activity.' },
  { id: 5, category: 'macro', source: 'Financial Times', title: 'Tech Giants Slump Amid AI Capital Outlay Concerns', time: '4h ago', desc: 'NASDAQ drags lower as hyper-scalers disclose elevated capital expenditure.' },
  { id: 6, category: 'crypto', source: 'Decrypt', title: 'Crypto Venture Capital Funding Rebounds in Q2', time: '6h ago', desc: 'Startups raised over $2.8B, representing a 20% quarter-on-quarter increase.' }
];

window.loadState = function() {
  const savedTheme = localStorage.getItem('tv_theme');
  if (savedTheme) {
    AppState.theme = savedTheme;
    document.body.className = savedTheme === 'light' ? 'light-theme' : '';
  }

  // Account records now come from the authenticated API. Existing legacy
  // localStorage keys are intentionally left untouched and never read.
  AppState.user = null;
};

window.loadAccountState = async function() {
  if (!TradingApi.getToken()) return;
  try {
    const [me, watchlist, alerts, portfolio] = await Promise.all([
      TradingApi.me(), TradingApi.getWatchlist(), TradingApi.getAlerts(), TradingApi.getPortfolio()
    ]);
    AppState.user = me.user;
    AppState.watchlist = watchlist.symbols;
    AppState.favorites = watchlist.favorites;
    AppState.alerts = alerts.alerts.map((alert) => ({
      id: alert._id, symbol: alert.symbol, condition: alert.condition, target: alert.target, active: alert.active
    }));
    AppState.portfolio = portfolio.portfolio;
    AppState.portfolio.transactions = portfolio.transactions;
  } catch (error) {
    AppState.user = null;
    if (TradingApi.getToken()) showToast(error.message || 'Could not load your account data', 'error');
  }
};

window.saveState = async function(section) {
  if (!AppState.user || !TradingApi.getToken()) {
    showToast('Sign in to save account data', 'warning');
    return false;
  }
  try {
    if (section === 'watchlist') {
      const saved = await TradingApi.saveWatchlist({ symbols: AppState.watchlist, favorites: AppState.favorites });
      AppState.watchlist = saved.symbols;
      AppState.favorites = saved.favorites;
    }
    return true;
  } catch (error) {
    showToast(error.message || 'Could not save account data', 'error');
    return false;
  }
};

window.AppConfig = {
  apiBase: 'https://api.binance.com',
  wsBase: 'wss://stream.binance.com:9443'
};
