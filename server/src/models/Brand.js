import mongoose from 'mongoose';

const brandSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, trim: true },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

brandSchema.index({ name: 1 });

export const Brand = mongoose.model('Brand', brandSchema);
