const mongoose = require('mongoose');

const DeletedBillSchema = new mongoose.Schema({
  invoiceNo: { type: String, required: true },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reason: String,
  originalData: Object,
  deletedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('DeletedBill', DeletedBillSchema);
