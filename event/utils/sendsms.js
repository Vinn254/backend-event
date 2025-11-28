require('dotenv').config();

// Twilio-based SMS sender
const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
const twilioFrom = process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_FROM;

let client = null;
if (twilioAccountSid && twilioAuthToken) {
  const twilio = require('twilio');
  client = twilio(twilioAccountSid, twilioAuthToken);
} else {
  console.warn('Twilio credentials not found in environment. SMS will not be sent.');
}

const sendSMS = async (phoneNumber, message) => {
  if (!client) {
    const err = new Error('Twilio client not configured');
    console.error(err);
    throw err;
  }

  try {
    const msg = await client.messages.create({
      body: message,
      from: twilioFrom,
      to: phoneNumber,
    });

    console.log('SMS sent successfully via Twilio:', msg.sid);
    return msg;
  } catch (error) {
    console.error('Error sending SMS via Twilio:', error);
    throw error;
  }
};

module.exports = { sendSMS };