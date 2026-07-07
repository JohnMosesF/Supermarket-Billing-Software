import mongoose from 'mongoose';

const inventoryLogSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    type: { type: String, enum: ['stock_in', 'stock_out', 'adjustment'], required: true },
    quantity: { type: Number, required: true },
    stockBefore: { type: Number, required: true },
    stockAfter: { type: Number, required: true },
    reason: { type: String, required: true },
    source: { type: String, enum: ['sale', 'purchase', 'manual', 'restore', 'sales_return', 'purchase_return', 'adjustment'], default: 'manual' },
    referenceId: mongoose.Schema.Types.ObjectId,
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill' },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
    purchaseInvoiceNo: String,
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

export const InventoryLog = mongoose.model('InventoryLog', inventoryLogSchema);
