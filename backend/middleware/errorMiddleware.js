export const notFound = (req, res, next) => {
  const error = new Error(`Resource not found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

export const errorHandler = (err, req, res, next) => {
  let statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  let message = err.message || 'An unexpected internal server error occurred';

  if (err.code === 11000) {
    statusCode = 409;
    message = 'An account with those details already exists.';
  } else if (err.name === 'ValidationError' || err.name === 'CastError') {
    statusCode = 400;
    message = 'The request contains invalid data.';
  }

  console.error(`[Error] ${req.method} ${req.originalUrl} - ${err.message}`);

  res.status(statusCode).json({
    success: false,
    message: process.env.NODE_ENV === 'production' && statusCode >= 500
      ? 'An unexpected internal server error occurred.'
      : message,
    // Never expose stack traces or internal secrets in production responses
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};
