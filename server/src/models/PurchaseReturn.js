import mongoose from 'mongoose';

const purchaseReturnItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  productIdNumber: Number,
  sku: String,
  productName: { type: String, required: true },
  unit: { type: String, default: 'pcs' },
  quantity: { type: Number, required: true, min: 0.001 },
  costPrice: { type: Number, required: true, min: 0 },
  gstRate: { type: Number, default: 0 },
  taxableAmount: { type: Number, required: true },
  gstAmount: { type: Number, required: true },
  returnAmount: { type: Number, required: true }
}, { _id: false });

const purchaseReturnSchema = new mongoose.Schema({
  returnNo: { type: String, required: true, unique: true, index: true },
  originalPurchase: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase', required: true, index: true },
  originalInvoiceNo: String,
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
  supplierName: String,
  items: { type: [purchaseReturnItemSchema], required: true },
  taxableAmount: { type: Number, required: true },
  gstAmount: { type: Number, required: true },
  returnAmount: { type: Number, required: true },
  reason: { type: String, required: true, trim: true },
  status: { type: String, enum: ['Completed', 'Cancelled'], default: 'Completed' },
  processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  returnDate: { type: Date, default: Date.now }
}, { timestamps: true });

export const PurchaseReturn = mongoose.model('PurchaseReturn', purchaseReturnSchema);
