const express = require('express');
const User = require('../models/user');
const Event = require('../models/event');
const Transaction = require('../models/transaction');
const { authMiddleware, adminMiddleware } = require('../middleware/authmiddleware');

const router = express.Router();

// Get all users
router.get('/users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all events
router.get('/events', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const events = await Event.find().populate('organizer', 'name email');
    res.json(events);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Update event status
router.put('/events/:id/status', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    const event = await Event.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }
    res.json(event);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all transactions
router.get('/transactions', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const transactions = await Transaction.find().populate('user', 'name email').populate('ticket');
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete user
router.delete('/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete event
router.delete('/events/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const event = await Event.findByIdAndDelete(req.params.id);
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }
    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get dashboard stats
router.get('/stats', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalEvents = await Event.countDocuments();
    const totalTransactions = await Transaction.countDocuments({ status: 'completed' });
    const totalRevenue = await Transaction.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    res.json({
      totalUsers,
      totalEvents,
      totalTransactions,
      totalRevenue: totalRevenue[0]?.total || 0,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get analytics data (for admin and organizers)
router.get('/analytics', authMiddleware, async (req, res) => {
  try {
    const { period = 'all', type = 'all' } = req.query;
    const user = req.user;

    let eventFilter = {};
    let dateFilter = {};

    // If not admin, only show user's events
    if (user.role !== 'admin') {
      eventFilter.organizer = user._id;
    }

    // Apply period and type filter
    const now = new Date();
    let startDate, endDate;

    switch (period) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = null;
    }

    if (type === 'upcoming') {
      endDate = null;
      startDate = startDate ? new Date(Math.max(startDate.getTime(), now.getTime())) : now;
    } else if (type === 'past') {
      endDate = now;
    } else {
      endDate = null;
    }

    if (startDate) {
      dateFilter.date = { $gte: startDate };
    }
    if (endDate) {
      dateFilter.date = { ...dateFilter.date, $lt: endDate };
    }

    const events = await Event.find({ ...eventFilter, ...dateFilter }).populate('organizer', 'name');

    // Calculate metrics
    const totalEvents = events.length;
    const totalTicketsSold = events.reduce((sum, event) => sum + (event.capacity - event.availableTickets), 0);
    const totalRevenue = events.reduce((sum, event) => sum + ((event.capacity - event.availableTickets) * event.price), 0);
    const totalUsers = user.role === 'admin' ? await User.countDocuments() : 1;

    // Category data
    const categoryData = {};
    events.forEach(event => {
      const category = event.category || 'General';
      categoryData[category] = (categoryData[category] || 0) + 1;
    });

    // Revenue trend (simplified)
    const revenueTrend = {};
    events.forEach(event => {
      const month = new Date(event.date).toLocaleString('default', { month: 'short', year: 'numeric' });
      revenueTrend[month] = (revenueTrend[month] || 0) + (event.revenue || 0);
    });

    // Top events
    const topEvents = events
      .sort((a, b) => (b.capacity - b.availableTickets) - (a.capacity - a.availableTickets))
      .slice(0, 10)
      .map(event => ({
        title: event.title,
        ticketsSold: event.capacity - event.availableTickets,
        revenue: (event.capacity - event.availableTickets) * event.price,
        rating: event.rating || null
      }));

    res.json({
      totalEvents,
      totalTicketsSold,
      totalRevenue,
      totalUsers,
      categoryData,
      revenueTrend,
      topEvents
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;