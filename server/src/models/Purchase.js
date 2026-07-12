import mongoose from 'mongoose';

const purchaseItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: String,
    quantity: { type: Number, required: true, min: 0.001 },
    unit: { type: String, default: 'pcs' },
    costPrice: { type: Number, required: true, min: 0 },
    gstRate: { type: Number, default: 0, min: 0 },
    mrp: { type: Number, default: 0, min: 0 },
    sellingPrice: { type: Number, default: 0, min: 0 },
    lineTotal: { type: Number, required: true }
  },
  { _id: false }
);

const purchaseSchema = new mongoose.Schema(
  {
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
    invoiceNumber: String,
    purchaseDate: { type: Date, default: Date.now },
    items: [purchaseItemSchema],
    total: { type: Number, required: true },
    paidAmount: { type: Number, default: 0 },
    returnCreditAmount: { type: Number, default: 0, min: 0 },
    sourcePurchaseOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder' },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: String,
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export const Purchase = mongoose.model('Purchase', purchaseSchema);
