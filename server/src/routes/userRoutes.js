import express from 'express';
import { createUser, createUserRules, deleteUser, listUsers, updateUser, userRules } from '../controllers/userController.js';
import { authorize, protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

export const userRoutes = express.Router();

userRoutes.use(protect, authorize('admin'));
userRoutes.route('/').get(listUsers).post(createUserRules, validate, createUser);
userRoutes.route('/:id').patch(userRules, validate, updateUser).delete(deleteUser);
