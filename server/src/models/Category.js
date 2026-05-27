import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, trim: true },
    taxRate: { type: Number, default: 0, min: 0 },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export const Category = mongoose.model('Category', categorySchema);
