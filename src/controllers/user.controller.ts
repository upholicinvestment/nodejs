import { Request, Response } from 'express';
import { User } from '../models/user.model';

export const getProfile = async (req: Request, res: Response) => {
  try {
    // Disable in public mode
    return res.status(403).json({ 
      message: 'User profiles are not available in public mode' 
    });

    /* Commented out the original implementation:
    const user = await User.findById((req as any).user.id).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
    */
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateProfile = async (req: Request, res: Response) => {
  try {
    // Disable in public mode
    return res.status(403).json({ 
      message: 'Profile updates are disabled in public mode' 
    });

    /* Commented out the original implementation:
    const { name, email } = req.body;
    const userId = (req as any).user.id;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (email && email !== user.email) {
      const emailExists = await User.findOne({ email });
      if (emailExists) {
        return res.status(400).json({ message: 'Email already in use' });
      }
    }

    user.name = name || user.name;
    user.email = email || user.email;

    const updatedUser = await user.save();

    res.json({
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
    });
    */
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};