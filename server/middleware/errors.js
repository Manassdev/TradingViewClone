function notFound(req, res) {
  res.status(404).json({ error: 'Route not found' });
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error.name === 'ValidationError' || error.name === 'CastError') {
    return res.status(400).json({ error: 'Invalid request data' });
  }
  if (error.code === 11000) return res.status(409).json({ error: 'Account already exists' });
  if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
  console.error('Request failed:', error.name || 'Error');
  res.status(500).json({ error: 'Internal server error' });
}

module.exports = { notFound, errorHandler };
