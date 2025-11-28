const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
  event: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  totalPrice: {
    type: Number,
    required: true,
  },
  status: {
    type: String,
    enum: ['booked', 'cancelled', 'used'],
    default: 'booked',
  },
  ticketNumber: {
    type: Number,
    unique: true,
    required: true,
  },
  purchaseDate: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

// Post-find hook to format ticket number as string with leading zeros
ticketSchema.post('findOne', function(doc) {
  if (doc && doc.ticketNumber) {
    doc.ticketNumber = String(doc.ticketNumber).padStart(6, '0');
  }
});

ticketSchema.post('find', function(docs) {
  docs.forEach(doc => {
    if (doc && doc.ticketNumber) {
      doc.ticketNumber = String(doc.ticketNumber).padStart(6, '0');
    }
  });
});

module.exports = mongoose.model('Ticket', ticketSchema);