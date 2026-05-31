const mongoose = require('mongoose');

const BillItemSchema = new mongoose.Schema({
  productId: { type: Number, required: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  name: String,
  quantity: { type: Number, required: true, min: 1 },
  sellingPrice: { type: Number, required: true, min: 0 },
  taxRate: { type: Number, default: 0, min: 0 }
});

const BillSchema = new mongoose.Schema({
  invoiceNo: { type: String, required: true, unique: true },
  items: [BillItemSchema],
  subtotal: { type: Number, required: true, min: 0 },
  taxTotal: { type: Number, required: true, min: 0 },
  discount: { type: Number, default: 0, min: 0 },
  total: { type: Number, required: true, min: 0 },
  paymentMethod: { 
    type: String, 
    enum: ['cash', 'upi', 'card', 'cheque', 'wallet', 'online'],
    default: 'cash' 
  },
  customerMobile: String,
  customerName: String,
  staff: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: Date
});

// Indexes for better query performance
BillSchema.index({ createdAt: -1 });
BillSchema.index({ customerMobile: 1 });
BillSchema.index({ invoiceNo: 1 });

module.exports = mongoose.model('Bill', BillSchema);
