import mongoose from 'mongoose';

const supplierPriceHistorySchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', index: true },
    purchase: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase', index: true },
    purchaseDate: { type: Date, required: true, index: true },
    purchasePrice: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 0.001 },
    invoiceNumber: String
  },
  { timestamps: true }
);

supplierPriceHistorySchema.index({ product: 1, purchaseDate: -1 });
supplierPriceHistorySchema.index({ supplier: 1, purchaseDate: -1 });

export const SupplierPriceHistory = mongoose.model('SupplierPriceHistory', supplierPriceHistorySchema);
