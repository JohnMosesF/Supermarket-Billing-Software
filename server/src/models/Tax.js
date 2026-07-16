import mongoose from 'mongoose';

export const GST_SLABS = [0, 3, 5, 12, 18, 28];

const taxSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    rate: { type: Number, required: true, enum: GST_SLABS, unique: true },
    description: { type: String, trim: true },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

taxSchema.index({ rate: 1 });

export const Tax = mongoose.model('Tax', taxSchema);
