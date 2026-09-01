const mongoose = require('mongoose');

const HoldBillItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  name: String,
  quantity: { type: Number, required: true, min: 0.001 },
  sellingPrice: { type: Number, required: true, min: 0 },
  taxRate: { type: Number, default: 0, min: 0 }
});

const HoldBillSchema = new mongoose.Schema({
  items: [HoldBillItemSchema],
  subtotal: { type: Number, required: true, min: 0 },
  taxTotal: { type: Number, required: true, min: 0 },
  discount: { type: Number, default: 0, min: 0 },
  total: { type: Number, required: true, min: 0 },
  customerMobile: String,
  customerName: String,
  heldBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) } // Holds expire after 24 hours
});

// Indexes for better query performance
HoldBillSchema.index({ createdAt: -1 });
HoldBillSchema.index({ expiresAt: 1 });
HoldBillSchema.index({ heldBy: 1 });

module.exports = mongoose.model('HoldBill', HoldBillSchema);
