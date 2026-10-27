import express from 'express';
import { createNewsController } from '../controllers/newsController.js';
import { newsService } from '../services/newsService.js';

export const createNewsRouter = (service = newsService) => {
  const router = express.Router();
  router.get('/', createNewsController(service));
  return router;
};

export default createNewsRouter();
