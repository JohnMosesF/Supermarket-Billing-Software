import mongoose from 'mongoose';
const schema = new mongoose.Schema({ partyType: { type: String, enum: ['Customer', 'Supplier'], required: true }, party: { type: mongoose.Schema.Types.ObjectId, required: true }, balance: { type: Number, required: true }, asOf: { type: Date, required: true }, metadata: mongoose.Schema.Types.Mixed }, { timestamps: true });
schema.index({ partyType: 1, party: 1, asOf: -1 });
export const OutstandingSnapshot = mongoose.model('OutstandingSnapshot', schema);
