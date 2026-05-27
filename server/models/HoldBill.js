const mongoose = require('mongoose');

const HoldBillSchema = new mongoose.Schema({
  items: [
    {
      _id: String,
      name: String,
      quantity: Number,
      sellingPrice: Number,
      taxRate: Number,
    },
  ],
  subtotal: Number,
  discount: Number,
  total: Number,
  customerMobile: String,
  heldBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('HoldBill', HoldBillSchema);
