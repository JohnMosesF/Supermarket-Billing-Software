import mongoose from 'mongoose';

const purchaseItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: String,
    sku: String,
    barcode: String,
    batchNo: { type: String, trim: true },
    expiryDate: Date,
    quantity: { type: Number, required: true, min: 0.001 },
    freeQuantity: { type: Number, default: 0, min: 0 },
    unit: { type: String, default: 'pcs' },
    costPrice: { type: Number, required: true, min: 0 },
    purchasePrice: { type: Number, min: 0 },
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

const purchaseSchema = new mongoose.Schema(
  {
    purchaseNo: { type: String, trim: true, unique: true, sparse: true, index: true },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
    invoiceNumber: String,
    supplierInvoice: { type: String, trim: true, index: true },
    purchaseDate: { type: Date, default: Date.now },
    expectedDeliveryDate: Date,
    paymentStatus: { type: String, enum: ['Unpaid', 'Partial', 'Paid'], default: 'Unpaid' },
    items: [purchaseItemSchema],
    itemCount: { type: Number, default: 0 },
    totalQuantity: { type: Number, default: 0 },
    subTotal: { type: Number, default: 0 },
    gstTotal: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    freightCharges: { type: Number, default: 0 },
    roundOff: { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0 },
    total: { type: Number, required: true },
    paidAmount: { type: Number, default: 0 },
    amountPaid: { type: Number, default: 0 },
    balance: { type: Number, default: 0 },
    returnCreditAmount: { type: Number, default: 0, min: 0 },
    sourcePurchaseOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder' },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: String,
    remarks: String,
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

purchaseSchema.index({ supplier: 1, purchaseDate: -1 });
purchaseSchema.index({ invoiceNumber: 1 });
purchaseSchema.index({ purchaseDate: -1 });

export const Purchase = mongoose.model('Purchase', purchaseSchema);
