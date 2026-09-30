const BINANCE_API_BASE = process.env.BINANCE_API_BASE || 'https://api.binance.com';

// @desc    Proxy Binance historical klines
// @route   GET /api/market/klines
// @access  Public
export const getKlines = async (req, res, next) => {
  try {
    const symbol = req.query.symbol || 'BTCUSDT';
    const interval = req.query.interval || '1h';
    const limit = req.query.limit || '300';

    const response = await fetch(
      `${BINANCE_API_BASE}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
    );

    if (!response.ok) {
      throw new Error(`Binance API responded with status ${response.status}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    next(err);
  }
};

// @desc    Proxy Binance 24hr ticker quotes
// @route   GET /api/market/ticker
// @access  Public
export const getTicker24hr = async (req, res, next) => {
  try {
    const symbols = req.query.symbols;
    let url = `${BINANCE_API_BASE}/api/v3/ticker/24hr`;
    if (symbols) {
      url += `?symbols=${encodeURIComponent(symbols)}`;
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Binance API responded with status ${response.status}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    next(err);
  }
};

// @desc    Get market classification & status
// @route   GET /api/market/status
// @access  Public
export const getMarketStatus = (req, res) => {
  res.json({
    success: true,
    dataSources: {
      crypto: {
        type: 'LIVE_API',
        provider: 'Binance REST & WebSockets',
        supported: true
      },
      stocks: {
        type: 'STATIC_MOCK',
        note: 'Equities and Indian stock details are demo datasets',
        supported: false
      },
      indices: {
        type: 'STATIC_MOCK',
        note: 'Global index prices are simulated',
        supported: false
      }
    }
  });
};
