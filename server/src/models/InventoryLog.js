import mongoose from 'mongoose';

const inventoryLogSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    type: { type: String, enum: ['stock_in', 'stock_out', 'adjustment'], required: true },
    quantity: { type: Number, required: true },
    referenceNumber: String,
    referenceType: { type: String, enum: ['Purchase', 'Sale', 'Return', 'Adjustment', 'Opening', 'Restore', 'Manual'], default: 'Manual', index: true },
    quantityIn: { type: Number, default: 0 },
    quantityOut: { type: Number, default: 0 },
    openingStock: { type: Number, default: 0 },
    closingStock: { type: Number, default: 0 },
    stockBefore: { type: Number, required: true },
    stockAfter: { type: Number, required: true },
    reason: { type: String, required: true },
    remarks: String,
    source: { type: String, enum: ['sale', 'purchase', 'manual', 'restore', 'sales_return', 'purchase_return', 'adjustment'], default: 'manual' },
    referenceId: mongoose.Schema.Types.ObjectId,
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill' },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
    purchaseInvoiceNo: String,
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

inventoryLogSchema.index({ product: 1, createdAt: -1 });
inventoryLogSchema.index({ referenceType: 1, referenceId: 1 });

export const InventoryLog = mongoose.model('InventoryLog', inventoryLogSchema);
