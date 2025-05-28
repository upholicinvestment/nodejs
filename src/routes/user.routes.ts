import { Router } from 'express';
import { getProfile, updateProfile } from '../controllers/user.controller';
// import { authenticate } from '../middleware/auth.middleware'; // Commented out for now

const router = Router();

// Make user routes public temporarily
// router.get('/profile', getProfile); // Removed: authenticate
// router.put('/profile', updateProfile); // Removed: authenticate

export default router;