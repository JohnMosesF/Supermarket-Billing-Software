import mongoose from 'mongoose';

const purchaseOrderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: String,
    quantity: { type: Number, required: true, min: 0.001 },
    receivedQuantity: { type: Number, default: 0, min: 0 },
    convertedQuantity: { type: Number, default: 0, min: 0 },
    unit: { type: String, default: 'pcs' },
    costPrice: { type: Number, required: true, min: 0 },
    gstRate: { type: Number, default: 0, min: 0 },
    mrp: { type: Number, default: 0, min: 0 },
    sellingPrice: { type: Number, default: 0, min: 0 },
    lineTotal: { type: Number, required: true }
  },
  { _id: false }
);

const purchaseOrderSchema = new mongoose.Schema(
  {
    poNumber: { type: String, required: true, unique: true, index: true },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
    orderDate: { type: Date, default: Date.now },
    expectedDate: Date,
    status: {
      type: String,
      enum: ['draft', 'pending', 'partially_received', 'completed', 'cancelled'],
      default: 'draft',
      index: true
    },
    items: [purchaseOrderItemSchema],
    total: { type: Number, required: true },
    notes: String,
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    purchase: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase' },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

purchaseOrderSchema.index({ poNumber: 'text', notes: 'text' });

export const PurchaseOrder = mongoose.model('PurchaseOrder', purchaseOrderSchema);
