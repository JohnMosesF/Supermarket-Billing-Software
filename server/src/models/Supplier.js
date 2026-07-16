import mongoose from 'mongoose';

const supplierSchema = new mongoose.Schema(
  {
    supplierId: { type: String, trim: true, unique: true, sparse: true },
    name: { type: String, required: true, trim: true },
    contactPerson: String,
    mobile: { type: String, trim: true },
    alternatePhone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    gstNumber: { type: String, trim: true, uppercase: true },
    panNumber: { type: String, trim: true, uppercase: true },
    address: String,
    city: String,
    state: String,
    pincode: String,
    openingBalance: { type: Number, default: 0 },
    remarks: String,
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

supplierSchema.index({ name: 1 });
supplierSchema.index({ mobile: 1 });
supplierSchema.index({ gstNumber: 1 });

export const Supplier = mongoose.model('Supplier', supplierSchema);
