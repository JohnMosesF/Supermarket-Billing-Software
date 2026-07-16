import mongoose from 'mongoose';
const allocationSchema = new mongoose.Schema({
  bill: { type: mongoose.Schema.Types.ObjectId, refPath: 'billModel' },
  billModel: { type: String, enum: ['Sale', 'Bill'], default: 'Bill' },
  invoiceNo: String,
  amount: { type: Number, min: 0.01 }
}, { _id: false });
const schema = new mongoose.Schema({
  receiptNo: { type: String, required: true, unique: true, index: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
  amount: { type: Number, required: true, min: 0.01 },
  paymentMethod: { type: String, enum: ['Cash', 'Bank', 'UPI', 'Card', 'Cheque', 'Wallet'], required: true },
  referenceNumber: { type: String, trim: true },
  allocationType: { type: String, enum: ['Allocated', 'On Account', 'Advance'], default: 'Allocated' },
  allocations: { type: [allocationSchema], default: [] },
  unallocatedAmount: { type: Number, default: 0, min: 0 },
  notes: String,
  narration: String,
  attachmentUrl: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiptDate: { type: Date, default: Date.now, index: true },
  status: { type: String, enum: ['Posted', 'Cancelled'], default: 'Posted' },
  cancelledAt: Date,
  cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  cancellationReason: String,
  reprintCount: { type: Number, default: 0 }
}, { timestamps: true });
schema.index({ customer: 1, receiptDate: -1 });
schema.index({ paymentMethod: 1, receiptDate: -1 });
export const CustomerReceipt = mongoose.model('CustomerReceipt', schema);
