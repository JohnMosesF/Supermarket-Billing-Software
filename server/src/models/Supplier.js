import mongoose from 'mongoose';

const supplierSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    contactPerson: String,
    mobile: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    gstNumber: String,
    address: String,
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export const Supplier = mongoose.model('Supplier', supplierSchema);
