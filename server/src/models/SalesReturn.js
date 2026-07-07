import mongoose from 'mongoose';

const returnItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  productIdNumber: Number,
  sku: String,
  barcode: String,
  productName: { type: String, required: true },
  localName: String,
  companyName: String,
  category: String,
  hsnCode: String,
  unit: { type: String, default: 'pcs' },
  quantity: { type: Number, required: true, min: 0.001 },
  price: { type: Number, required: true, min: 0 },
  gstRate: { type: Number, default: 0, min: 0 },
  discount: { type: Number, default: 0, min: 0 },
  taxableAmount: { type: Number, required: true, min: 0 },
  gstAmount: { type: Number, required: true, min: 0 },
  refundAmount: { type: Number, required: true, min: 0 }
}, { _id: false });

const salesReturnSchema = new mongoose.Schema({
  returnNo: { type: String, required: true, unique: true, index: true },
  originalBill: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill', required: true, index: true },
  originalInvoiceNo: { type: String, required: true, index: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  customerName: String,
  customerMobile: String,
  originalPaymentMethod: String,
  items: { type: [returnItemSchema], required: true },
  taxableAmount: { type: Number, required: true },
  gstAmount: { type: Number, required: true },
  discount: { type: Number, default: 0 },
  refundAmount: { type: Number, required: true },
  refundMethod: { type: String, enum: ['Cash', 'Credit Adjustment', 'UPI', 'Card'], required: true },
  reason: { type: String, required: true, trim: true },
  status: { type: String, enum: ['Completed', 'Cancelled'], default: 'Completed' },
  processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  returnDate: { type: Date, default: Date.now }
}, { timestamps: true });

export const SalesReturn = mongoose.model('SalesReturn', salesReturnSchema);
