import mongoose from 'mongoose';

const supplierSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    contactPerson: String,
    mobile: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    gstNumber: String,
    address: String,
    notes: String,
    totalPurchases: { type: Number, default: 0, min: 0 },
    totalReturns: { type: Number, default: 0, min: 0 },
    outstandingBalance: { type: Number, default: 0, min: 0 },
    totalPayments: { type: Number, default: 0, min: 0 },
    lastPurchaseDate: Date,
    lastPaymentDate: Date,
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export const Supplier = mongoose.model('Supplier', supplierSchema);
