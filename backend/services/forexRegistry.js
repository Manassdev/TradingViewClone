const CURRENCIES = Object.freeze({
  EUR: 'Euro', GBP: 'British Pound', USD: 'US Dollar', JPY: 'Japanese Yen', CHF: 'Swiss Franc',
  AUD: 'Australian Dollar', CAD: 'Canadian Dollar', NZD: 'New Zealand Dollar', SGD: 'Singapore Dollar',
  HKD: 'Hong Kong Dollar', MXN: 'Mexican Peso', ZAR: 'South African Rand', TRY: 'Turkish Lira',
  NOK: 'Norwegian Krone', SEK: 'Swedish Krona', DKK: 'Danish Krone', PLN: 'Polish Zloty',
  CNY: 'Chinese Yuan', CNH: 'Offshore Chinese Yuan', INR: 'Indian Rupee', KRW: 'South Korean Won',
  THB: 'Thai Baht', HUF: 'Hungarian Forint', CZK: 'Czech Koruna', ILS: 'Israeli Shekel'
});

const PAIRS = [
  ['EURUSD', 'major'], ['GBPUSD', 'major'], ['USDJPY', 'major'], ['USDCHF', 'major'],
  ['AUDUSD', 'major'], ['USDCAD', 'major'], ['NZDUSD', 'major'],
  ['EURGBP', 'minor'], ['EURJPY', 'minor'], ['GBPJPY', 'minor'], ['EURAUD', 'minor'],
  ['GBPCHF', 'minor'], ['AUDJPY', 'minor'], ['EURCHF', 'minor'], ['CADJPY', 'minor']
];

const normalizePairSymbol = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim().toUpperCase().replace(/=X$/, '').replace(/[\s/_-]/g, '');
};

const makePair = (symbol, category = 'exotic', customName = '') => {
  const normalized = normalizePairSymbol(symbol);
  if (!/^[A-Z]{6}$/.test(normalized)) return null;
  const base = normalized.slice(0, 3);
  const quote = normalized.slice(3, 6);
  return {
    symbol: normalized,
    providerSymbol: `${base}/${quote}`,
    pair: `${base}/${quote}`,
    base,
    quote,
    baseName: CURRENCIES[base] || base,
    quoteName: CURRENCIES[quote] || quote,
    name: customName || `${CURRENCIES[base] || base} / ${CURRENCIES[quote] || quote}`,
    category
  };
};

const configuredPairs = () => {
  const extras = String(process.env.FOREX_EXTRA_PAIRS || '').split(',').map((part) => part.trim()).filter(Boolean);
  return extras.map((entry) => {
    const [symbol, name] = entry.split(':', 2).map((part) => part.trim());
    return makePair(symbol, 'exotic', name || '');
  }).filter(Boolean);
};

export const getForexPairs = () => {
  const standard = PAIRS.map(([symbol, category]) => makePair(symbol, category));
  const all = [...standard, ...configuredPairs()];
  return [...new Map(all.map((pair) => [pair.symbol, pair])).values()];
};

export const normalizeForexSymbol = normalizePairSymbol;
export const getForexPair = (value) => getForexPairs().find((pair) => pair.symbol === normalizePairSymbol(value)) || null;

export const searchForexPairs = (query) => {
  const term = String(query || '').trim().toUpperCase();
  if (!term) return getForexPairs();
  const compact = normalizePairSymbol(term);
  return getForexPairs().filter((pair) => pair.symbol.includes(compact) || pair.pair.includes(term.replace(/\s/g, '')) || pair.base.includes(term) || pair.quote.includes(term) || pair.name.toUpperCase().includes(term) || pair.baseName.toUpperCase().includes(term) || pair.quoteName.toUpperCase().includes(term));
};
