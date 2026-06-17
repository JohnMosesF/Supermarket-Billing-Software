import mongoose from 'mongoose';

const saleItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    sku: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0.001 },
    price: { type: Number, required: true, min: 0 },
    purchasePrice: { type: Number, required: true, min: 0 },
    taxRate: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    lineTotal: { type: Number, required: true }
  },
  { _id: false }
);

const saleSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true, index: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    customerName: String,
    customerMobile: String,
    items: [saleItemSchema],
    subtotal: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    taxTotal: { type: Number, default: 0 },
    total: { type: Number, required: true },
    profit: { type: Number, default: 0 },
    paymentMethod: { type: String, enum: ['cash', 'upi', 'card', 'bank_transfer', 'credit'], required: true },
    paymentStatus: { type: String, enum: ['paid', 'partial', 'unpaid', 'pending', 'refunded'], default: 'paid' },
    paidAmount: { type: Number, default: 0 },
    balanceAmount: { type: Number, default: 0 },
    changeReturn: { type: Number, default: 0 },
    cashier: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    notes: String
  },
  { timestamps: true }
);

export const Sale = mongoose.model('Sale', saleSchema);
