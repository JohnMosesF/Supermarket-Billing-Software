import express from 'express';
import { changePassword, changePasswordRules, login, loginRules, me } from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

export const authRoutes = express.Router();

authRoutes.post('/login', loginRules, validate, login);
authRoutes.get('/me', protect, me);
authRoutes.patch('/password', protect, changePasswordRules, validate, changePassword);
