import mongoose from 'mongoose';

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    mobile: { type: String, required: true, unique: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    address: String,
    loyaltyPoints: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 }
  },
  { timestamps: true }
);

customerSchema.index({ name: 'text', mobile: 'text', email: 'text' });

export const Customer = mongoose.model('Customer', customerSchema);
