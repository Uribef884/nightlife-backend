import express from 'express';
import { handleWompiWebhook } from '../controllers/webhook.controller';
import { webhookRateLimiter } from '../middlewares/rateLimiter';


const router = express.Router();

router.post('/wompi', webhookRateLimiter, handleWompiWebhook);

export default router;
