const mongoose = require('mongoose');

const BillItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  name: String,
  quantity: Number,
  sellingPrice: Number,
  taxRate: Number
});

const BillSchema = new mongoose.Schema({
  invoiceNo: { type: String, required: true, unique: true },
  items: [BillItemSchema],
  subtotal: Number,
  taxTotal: Number,
  discount: Number,
  total: Number,
  paymentMethod: { type: String, enum: ['cash','upi','card'], default: 'cash' },
  customerMobile: String,
  staff: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: Date
});

module.exports = mongoose.model('Bill', BillSchema);
