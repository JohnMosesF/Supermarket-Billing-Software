import mongoose from 'mongoose';

const purchaseOrderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: String,
    sku: String,
    barcode: String,
    pid: String,
    quantity: { type: Number, required: true, min: 0.001 },
    freeQuantity: { type: Number, default: 0, min: 0 },
    receivedQuantity: { type: Number, default: 0, min: 0 },
    receivedFreeQuantity: { type: Number, default: 0, min: 0 },
    convertedQuantity: { type: Number, default: 0, min: 0 },
    convertedFreeQuantity: { type: Number, default: 0, min: 0 },
    unit: { type: String, default: 'pcs' },
    costPrice: { type: Number, required: true, min: 0 },
    purchasePrice: { type: Number, default: 0, min: 0 },
    gstRate: { type: Number, default: 0, min: 0 },
    gstInclusive: { type: Boolean, default: false },
    taxableAmount: { type: Number, default: 0, min: 0 },
    gstAmount: { type: Number, default: 0, min: 0 },
    cgst: { type: Number, default: 0, min: 0 },
    sgst: { type: Number, default: 0, min: 0 },
    igst: { type: Number, default: 0, min: 0 },
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    discountAmount: { type: Number, default: 0, min: 0 },
    mrp: { type: Number, default: 0, min: 0 },
    wholesalePrice: { type: Number, default: 0, min: 0 },
    retailPrice: { type: Number, default: 0, min: 0 },
    sellingPrice: { type: Number, default: 0, min: 0 },
    netAmount: { type: Number, default: 0, min: 0 },
    lineTotal: { type: Number, required: true }
  },
  { _id: false }
);

const purchaseOrderReceiptSchema = new mongoose.Schema(
  {
    receiptNo: String,
    receivedAt: { type: Date, default: Date.now },
    receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: String,
    items: [{
      product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
      name: String,
      quantity: { type: Number, required: true, min: 0.001 },
      freeQuantity: { type: Number, default: 0, min: 0 },
      unit: String
    }]
  },
  { _id: true }
);

const purchaseOrderSchema = new mongoose.Schema(
  {
    poNumber: { type: String, required: true, unique: true, index: true },
    referenceNumber: { type: String, trim: true },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
    orderDate: { type: Date, default: Date.now },
    expectedDate: Date,
    status: {
      type: String,
      enum: ['draft', 'ordered', 'pending', 'partially_received', 'completed', 'cancelled'],
      default: 'draft',
      index: true
    },
    items: [purchaseOrderItemSchema],
    itemCount: { type: Number, default: 0 },
    totalQuantity: { type: Number, default: 0 },
    receivedQuantity: { type: Number, default: 0 },
    subTotal: { type: Number, default: 0 },
    taxableAmount: { type: Number, default: 0 },
    gstTotal: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    roundOff: { type: Number, default: 0 },
    roundOffMode: { type: String, enum: ['auto', 'manual'], default: 'auto' },
    grandTotal: { type: Number, default: 0 },
    total: { type: Number, required: true },
    notes: String,
    receivingHistory: [purchaseOrderReceiptSchema],
    convertedAt: Date,
    convertedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    cancelledAt: Date,
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    cancellationReason: String,
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    purchase: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase' },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

purchaseOrderSchema.index({ poNumber: 'text', notes: 'text', referenceNumber: 'text' });
purchaseOrderSchema.index({ supplier: 1, createdAt: -1 });

export const PurchaseOrder = mongoose.model('PurchaseOrder', purchaseOrderSchema);
