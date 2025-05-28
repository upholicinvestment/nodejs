import { Router } from 'express';
import { login, register } from '../controllers/auth.controller';

const router = Router();

// These remain but won't be used in the public version
// router.post('/login', login);
// router.post('/register', register);

export default router;