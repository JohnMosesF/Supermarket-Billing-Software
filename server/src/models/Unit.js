import mongoose from 'mongoose';

export const DEFAULT_UNITS = [
  { name: 'kg', allowDecimal: true },
  { name: 'g', allowDecimal: true },
  { name: 'litre', allowDecimal: true },
  { name: 'l', allowDecimal: true },
  { name: 'ml', allowDecimal: true },
  { name: 'pcs', allowDecimal: false },
  { name: 'piece', allowDecimal: false },
  { name: 'packet', allowDecimal: false },
  { name: 'pkt', allowDecimal: false },
  { name: 'box', allowDecimal: false },
  { name: 'part', allowDecimal: false },
  { name: 'unit', allowDecimal: false }
];

const unitSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, lowercase: true, unique: true },
    allowDecimal: { type: Boolean, default: false },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export const Unit = mongoose.model('Unit', unitSchema);
