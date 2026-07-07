import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },
  referenceId: mongoose.Schema.Types.ObjectId,
  sourceModel: { type: String, required: true },
  sourceKey: { type: String, required: true, unique: true },
  transactionType: { type: String, required: true },
  documentNo: String,
  narration: String,
  amount: { type: Number, required: true },
  debit: { type: Number, default: 0 },
  credit: { type: Number, default: 0 },
  balance: { type: Number, default: 0 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  transactionDate: { type: Date, required: true, index: true }
}, { timestamps: true });
schema.index({ supplier: 1, transactionDate: 1 });
export const SupplierLedger = mongoose.model('SupplierLedger', schema);
