import mongoose from 'mongoose';

const purchaseItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: String,
    quantity: { type: Number, required: true, min: 1 },
    costPrice: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true }
  },
  { _id: false }
);

const purchaseSchema = new mongoose.Schema(
  {
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
    invoiceNumber: String,
    items: [purchaseItemSchema],
    total: { type: Number, required: true },
    paidAmount: { type: Number, default: 0 },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: String
  },
  { timestamps: true }
);

export const Purchase = mongoose.model('Purchase', purchaseSchema);
