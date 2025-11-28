const express = require('express');
const User = require('../models/user');
const { authMiddleware } = require('../middleware/authmiddleware');
const jwt = require('jsonwebtoken');
const jwtSecret = process.env.JWT_SECRET || 'default-jwt-secret-for-development';
const generateOTP = require('../utils/generateotp');
const { sendEmail } = require('../utils/sendemail');
const { sendSMS } = require('../utils/sendsms');

const router = express.Router();

// Register user
router.post('/register', async (req, res) => {
  try {
    const { name, email, phone, password, role, otpMethod } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Generate OTP
    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Create user
    const user = new User({
      name,
      email,
      phone,
      password,
      role,
      otp,
      otpExpires,
    });

    await user.save();

    // Send OTP
    try {
      if (otpMethod === 'email') {
        await sendEmail(email, 'Your OTP Code', `Your OTP code is: ${otp}`);
      } else {
        await sendSMS(phone, `Your OTP code is: ${otp}`);
      }
    } catch (sendError) {
      console.error('Failed to send OTP, setting user as verified:', sendError);
      user.isVerified = true;
      await user.save();
    }

    res.status(201).json({ message: 'User registered. Please verify OTP.', otp });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    if (!user.isVerified) {
      return res.status(400).json({ requiresVerification: true, user: { email: user.email } });
    }

    const token = jwt.sign({ id: user._id }, jwtSecret, { expiresIn: '7d' });

    res.json({ user, token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Verify OTP
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'User not found' });
    }

    if (user.isVerified) {
      // Already verified, return success
      const token = jwt.sign({ id: user._id }, jwtSecret, { expiresIn: '7d' });
      return res.json({ user, token });
    }

    if (!user.otp || user.otp !== otp || user.otpExpires < new Date()) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    user.isVerified = true;
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();

    const token = jwt.sign({ id: user._id }, jwtSecret, { expiresIn: '7d' });

    res.json({ user, token });
  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update profile
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { name, email, phone } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.name = name || user.name;
    user.email = email || user.email;
    user.phone = phone || user.phone;

    await user.save();

    res.json({ user });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;