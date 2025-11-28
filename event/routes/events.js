const express = require('express');
const multer = require('multer');
const path = require('path');
const Event = require('../models/event');
const Ticket = require('../models/ticket');
const Transaction = require('../models/transaction');
const { authMiddleware } = require('../middleware/authmiddleware');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

const router = express.Router();

// Get all events
router.get('/', async (req, res) => {
  try {
    const events = await Event.find({ status: 'active' }).populate('organizer', 'name email');
    res.json(events);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get organizer's events (must come before /:id route)
router.get('/my-events', authMiddleware, async (req, res) => {
  try {
    console.log('Fetching events for user:', req.user._id);
    const events = await Event.find({ organizer: req.user._id }).populate('organizer', 'name email');
    console.log('Events found:', events.length);
    res.json(events);
  } catch (error) {
    console.error('Error fetching my events:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get event analytics (organizer only) (must come before /:id route)
router.get('/analytics', authMiddleware, async (req, res) => {
   try {
     console.log('Fetching analytics for user:', req.user._id);
     const events = await Event.find({ organizer: req.user._id });
     console.log('Analytics events found:', events.length);
     const totalEvents = events.length;
     const totalTicketsSold = events.reduce((sum, event) => sum + (event.capacity - event.availableTickets), 0);
     const totalRevenue = events.reduce((sum, event) => sum + ((event.capacity - event.availableTickets) * event.price), 0);

     res.json({
       totalEvents,
       totalTicketsSold,
       totalRevenue,
       events: events.map(event => ({
         title: event.title,
         ticketsSold: event.capacity - event.availableTickets,
         revenue: (event.capacity - event.availableTickets) * event.price
       }))
     });
   } catch (error) {
     console.error('Error fetching analytics:', error);
     res.status(500).json({ message: 'Server error', error: error.message });
   }
});

// Get event by ID
router.get('/:id', async (req, res) => {
  try {
    const event = await Event.findById(req.params.id).populate('organizer', 'name email');
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }
    res.json(event);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Create event (organizer only)
router.post('/', authMiddleware, upload.single('image'), async (req, res) => {
   try {
     const { title, description, date, time, location, category, price, capacity } = req.body;

     // Handle image upload
     let imagePath = null;
     if (req.file) {
       imagePath = `/uploads/${req.file.filename}`;
     }

     const event = new Event({
       title,
       description,
       date,
       time,
       location,
       category,
       price,
       capacity,
       availableTickets: capacity,
       organizer: req.user._id,
       image: imagePath,
     });

     await event.save();
     res.status(201).json(event);
   } catch (error) {
     console.error('Error creating event:', error);
     res.status(500).json({ message: 'Server error', error: error.message });
   }
});

// Update event (organizer only)
router.put('/:id', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    if (event.organizer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Handle image upload if a new image is provided
    if (req.file) {
      event.image = `/uploads/${req.file.filename}`;
    }

    const updates = req.body;
    Object.keys(updates).forEach(key => {
      if (key !== 'image') { // Don't override image from body if we handled it above
        event[key] = updates[key];
      }
    });

    await event.save();
    res.json(event);
  } catch (error) {
    console.error('Error updating event:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete event (organizer only)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    if (event.organizer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    await Event.findByIdAndDelete(req.params.id);
    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Book tickets
router.post('/:id/book', authMiddleware, async (req, res) => {
  try {
    const { quantity } = req.body;
    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    if (event.availableTickets < quantity) {
      return res.status(400).json({ message: 'Not enough tickets available' });
    }

    const totalPrice = event.price * quantity;
    
    // Get the next ticket number by counting total tickets
    const ticketCount = await Ticket.countDocuments();
    const ticketNumber = ticketCount + 1;

    const ticket = new Ticket({
      event: event._id,
      user: req.user._id,
      quantity,
      totalPrice,
      ticketNumber,
    });

    await ticket.save();

    event.availableTickets -= quantity;
    await event.save();

    // Create transaction record for the ticket booking
    const transaction = new Transaction({
      user: req.user._id,
      ticket: ticket._id,
      amount: totalPrice,
      paymentMethod: 'direct',
      status: 'completed',
      transactionId: `TXN-${ticket._id}`,
    });
    
    await transaction.save();

    res.status(201).json(ticket);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user's tickets
router.get('/tickets/my', authMiddleware, async (req, res) => {
  try {
    const tickets = await Ticket.find({ user: req.user._id }).populate('event');
    res.json(tickets);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get organizer's sold tickets
router.get('/tickets/sold', authMiddleware, async (req, res) => {
   try {
     // First get organizer's events
     const events = await Event.find({ organizer: req.user._id }).select('_id');
     const eventIds = events.map(event => event._id);

     // Then find tickets for those events
     const tickets = await Ticket.find({ event: { $in: eventIds } })
       .populate('event')
       .populate('user', 'name email');

     res.json(tickets);
   } catch (error) {
     console.error('Error fetching sold tickets:', error);
     res.status(500).json({ message: 'Server error', error: error.message });
   }
});

module.exports = router;