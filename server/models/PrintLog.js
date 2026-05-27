const mongoose = require('mongoose');

const PrintLogSchema = new mongoose.Schema({
  invoiceNo: String,
  printer: String,
  success: Boolean,
  error: String,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('PrintLog', PrintLogSchema);
