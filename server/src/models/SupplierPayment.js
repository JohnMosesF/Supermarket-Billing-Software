import mongoose from 'mongoose';
const allocationSchema = new mongoose.Schema({ purchase: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase' }, invoiceNumber: String, amount: { type: Number, min: 0.01 } }, { _id: false });
const schema = new mongoose.Schema({
  voucherNo: { type: String, required: true, unique: true, index: true },
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },
  amount: { type: Number, required: true, min: 0.01 },
  paymentMethod: { type: String, enum: ['Cash', 'Bank', 'UPI', 'Card', 'Cheque'], required: true },
  allocations: { type: [allocationSchema], default: [] },
  unallocatedAmount: { type: Number, default: 0, min: 0 },
  notes: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  paymentDate: { type: Date, default: Date.now, index: true },
  status: { type: String, enum: ['Posted', 'Cancelled'], default: 'Posted' }
}, { timestamps: true });
export const SupplierPayment = mongoose.model('SupplierPayment', schema);
