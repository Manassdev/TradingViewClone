const instruments = [
  { exchange: 'NSE', symbol: 'RELIANCE', name: 'Reliance Industries Ltd.', assetType: 'india_stock', currency: 'INR', providerSymbol: 'RELIANCE', sector: 'Energy' },
  { exchange: 'NSE', symbol: 'TCS', name: 'Tata Consultancy Services Ltd.', assetType: 'india_stock', currency: 'INR', providerSymbol: 'TCS', sector: 'Information Technology' },
  { exchange: 'NSE', symbol: 'INFY', name: 'Infosys Ltd.', assetType: 'india_stock', currency: 'INR', providerSymbol: 'INFY', sector: 'Information Technology' },
  { exchange: 'NSE', symbol: 'HDFCBANK', name: 'HDFC Bank Ltd.', assetType: 'india_stock', currency: 'INR', providerSymbol: 'HDFCBANK', sector: 'Financial Services' },
  { exchange: 'NSE', symbol: 'ICICIBANK', name: 'ICICI Bank Ltd.', assetType: 'india_stock', currency: 'INR', providerSymbol: 'ICICIBANK', sector: 'Financial Services' },
  { exchange: 'NSE', symbol: 'SBIN', name: 'State Bank of India', assetType: 'india_stock', currency: 'INR', providerSymbol: 'SBIN', sector: 'Financial Services' },
  { exchange: 'NSE', symbol: 'ITC', name: 'ITC Ltd.', assetType: 'india_stock', currency: 'INR', providerSymbol: 'ITC', sector: 'Consumer Goods' },
  { exchange: 'NSE', symbol: 'LT', name: 'Larsen & Toubro Ltd.', assetType: 'india_stock', currency: 'INR', providerSymbol: 'LT', sector: 'Industrials' },
  { exchange: 'NSE', symbol: 'BHARTIARTL', name: 'Bharti Airtel Ltd.', assetType: 'india_stock', currency: 'INR', providerSymbol: 'BHARTIARTL', sector: 'Telecommunications' },
  { exchange: 'NSE', symbol: 'TATAMOTORS', name: 'Tata Motors Ltd.', assetType: 'india_stock', currency: 'INR', providerSymbol: 'TATAMOTORS', sector: 'Automotive' },
  { exchange: 'BSE', symbol: 'RELIANCE', name: 'Reliance Industries Ltd.', assetType: 'india_stock', currency: 'INR', providerSymbol: 'RELIANCE', sector: 'Energy' },
  { exchange: 'BSE', symbol: 'TCS', name: 'Tata Consultancy Services Ltd.', assetType: 'india_stock', currency: 'INR', providerSymbol: 'TCS', sector: 'Information Technology' },
  { exchange: 'BSE', symbol: 'INFY', name: 'Infosys Ltd.', assetType: 'india_stock', currency: 'INR', providerSymbol: 'INFY', sector: 'Information Technology' },
  { exchange: 'BSE', symbol: 'HDFCBANK', name: 'HDFC Bank Ltd.', assetType: 'india_stock', currency: 'INR', providerSymbol: 'HDFCBANK', sector: 'Financial Services' },
  { exchange: 'BSE', symbol: 'ICICIBANK', name: 'ICICI Bank Ltd.', assetType: 'india_stock', currency: 'INR', providerSymbol: 'ICICIBANK', sector: 'Financial Services' },
  { exchange: 'BSE', symbol: 'SBIN', name: 'State Bank of India', assetType: 'india_stock', currency: 'INR', providerSymbol: 'SBIN', sector: 'Financial Services' },
  { exchange: 'BSE', symbol: 'ITC', name: 'ITC Ltd.', assetType: 'india_stock', currency: 'INR', providerSymbol: 'ITC', sector: 'Consumer Goods' },
  { exchange: 'BSE', symbol: 'LT', name: 'Larsen & Toubro Ltd.', assetType: 'india_stock', currency: 'INR', providerSymbol: 'LT', sector: 'Industrials' },
  { exchange: 'BSE', symbol: 'BHARTIARTL', name: 'Bharti Airtel Ltd.', assetType: 'india_stock', currency: 'INR', providerSymbol: 'BHARTIARTL', sector: 'Telecommunications' },
  { exchange: 'BSE', symbol: 'TATAMOTORS', name: 'Tata Motors Ltd.', assetType: 'india_stock', currency: 'INR', providerSymbol: 'TATAMOTORS', sector: 'Automotive' },
  { exchange: 'NSE', symbol: 'NIFTY', name: 'NIFTY 50', assetType: 'india_index', currency: 'INR', providerSymbol: 'NIFTY', sector: 'Broad Market' },
  { exchange: 'NSE', symbol: 'BANKNIFTY', name: 'NIFTY Bank', assetType: 'india_index', currency: 'INR', providerSymbol: 'BANKNIFTY', sector: 'Financial Services' },
  { exchange: 'NSE', symbol: 'FINNIFTY', name: 'NIFTY Financial Services', assetType: 'india_index', currency: 'INR', providerSymbol: 'FINNIFTY', sector: 'Financial Services' },
  { exchange: 'BSE', symbol: 'SENSEX', name: 'S&P BSE SENSEX', assetType: 'india_index', currency: 'INR', providerSymbol: 'SENSEX', sector: 'Broad Market' }
].map((instrument) => Object.freeze({ ...instrument }));

const normalizeExchange = (value) => String(value || '').trim().toUpperCase();
const normalizeSymbol = (value) => String(value || '').trim().toUpperCase().replace(/\s+/g, '');

export const getIndiaInstruments = ({ exchange, assetType, query } = {}) => {
  const term = String(query || '').trim().toLowerCase();
  return instruments.filter((instrument) =>
    (!exchange || instrument.exchange === normalizeExchange(exchange)) &&
    (!assetType || instrument.assetType === assetType) &&
    (!term || `${instrument.symbol} ${instrument.name} ${instrument.exchange} ${instrument.sector}`.toLowerCase().includes(term))
  );
};

export const getIndiaInstrument = (exchange, symbol) => {
  const normalizedExchange = normalizeExchange(exchange);
  const normalizedSymbol = normalizeSymbol(symbol);
  return instruments.find((item) => item.exchange === normalizedExchange && item.symbol === normalizedSymbol) || null;
};

export const searchIndiaInstruments = (query) => getIndiaInstruments({ query });
export const normalizeIndiaSymbol = normalizeSymbol;
export const INDIA_EXCHANGES = Object.freeze(['NSE', 'BSE']);
