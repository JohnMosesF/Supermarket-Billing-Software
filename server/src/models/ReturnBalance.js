import mongoose from 'mongoose';

const returnBalanceSchema = new mongoose.Schema({
  sourceType: { type: String, enum: ['Bill', 'Purchase'], required: true },
  source: { type: mongoose.Schema.Types.ObjectId, required: true },
  quantities: { type: Map, of: Number, default: {} }
}, { timestamps: true });

returnBalanceSchema.index({ sourceType: 1, source: 1 }, { unique: true });

export const ReturnBalance = mongoose.model('ReturnBalance', returnBalanceSchema);
