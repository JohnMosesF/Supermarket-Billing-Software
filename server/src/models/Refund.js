import mongoose from 'mongoose';

const refundItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    productName: { type: String, trim: true },
    quantity: { type: Number, min: 1, default: 1 },
    price: { type: Number, min: 0, default: 0 },
    total: { type: Number, min: 0, default: 0 }
  },
  { _id: false }
);

const refundSchema = new mongoose.Schema(
  {
    bill: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill', required: true },
    items: { type: [refundItemSchema], default: [] },
    type: { type: String, trim: true, default: 'partial' },
    reason: { type: String, trim: true },
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

const Refund = mongoose.model('Refund', refundSchema);
export default Refund;
