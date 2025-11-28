const express = require('express');
const Transaction = require('../models/transaction');
const Ticket = require('../models/ticket');
const { authMiddleware } = require('../middleware/authmiddleware');
const { initiateSTKPush } = require('../config/mpesa');

const router = express.Router();

// Initiate M-Pesa payment
router.post('/mpesa', authMiddleware, async (req, res) => {
  try {
    const { ticketId, phoneNumber } = req.body;

    const ticket = await Ticket.findById(ticketId).populate('event');
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    if (ticket.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Initiate STK push
    const result = await initiateSTKPush(
      phoneNumber,
      ticket.totalPrice,
      `Ticket-${ticketId}`,
      `Payment for ${ticket.event.title} tickets`
    );

    // Create transaction record
    const transaction = new Transaction({
      user: req.user._id,
      ticket: ticketId,
      amount: ticket.totalPrice,
      paymentMethod: 'mpesa',
      transactionId: result.CheckoutRequestID,
    });

    await transaction.save();

    res.json({ message: 'Payment initiated', transactionId: result.CheckoutRequestID });
  } catch (error) {
    console.error('Payment initiation error:', error);
    res.status(500).json({ message: 'Payment initiation failed' });
  }
});

// M-Pesa callback (webhook)
router.post('/mpesa/callback', async (req, res) => {
  try {
    const { Body } = req.body;

    if (Body.stkCallback.ResultCode === 0) {
      const transactionId = Body.stkCallback.CheckoutRequestID;
      const mpesaReceiptNumber = Body.stkCallback.CallbackMetadata.Item.find(
        item => item.Name === 'MpesaReceiptNumber'
      ).Value;

      const transaction = await Transaction.findOne({ transactionId });
      if (transaction) {
        transaction.status = 'completed';
        transaction.mpesaReceiptNumber = mpesaReceiptNumber;
        await transaction.save();

        // Update ticket status if needed
        const ticket = await Ticket.findById(transaction.ticket);
        if (ticket) {
          // Additional logic for ticket confirmation
        }
      }
    }

    res.json({ message: 'Callback received' });
  } catch (error) {
    console.error('Callback processing error:', error);
    res.status(500).json({ message: 'Callback processing failed' });
  }
});

// Get user's transactions
router.get('/my', authMiddleware, async (req, res) => {
  try {
    const transactions = await Transaction.find({ user: req.user._id }).populate('ticket');
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;