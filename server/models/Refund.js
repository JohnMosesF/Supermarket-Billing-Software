const mongoose = require('mongoose');

const RefundSchema = new mongoose.Schema({
  bill: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill', required: true },
  items: Array, // items being refunded
  type: { type: String, enum: ['full', 'partial'], default: 'partial' },
  reason: String,
  processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Refund', RefundSchema);
