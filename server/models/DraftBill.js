const mongoose = require('mongoose');

const DraftBillSchema = new mongoose.Schema({
  draftId: { type: String, required: true, unique: true },
  invoiceNo: String,
  items: Array,
  subtotal: Number,
  discount: Number,
  total: Number,
  customerMobile: String,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('DraftBill', DraftBillSchema);
