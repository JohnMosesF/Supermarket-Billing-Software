import mongoose from 'mongoose';

const holdBillSchema = new mongoose.Schema(
  {
    snapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
    invoice: { type: mongoose.Schema.Types.Mixed, default: {} },
    customer: { type: mongoose.Schema.Types.Mixed, default: {} },
    cart: { type: [mongoose.Schema.Types.Mixed], default: [] },
    totals: { type: mongoose.Schema.Types.Mixed, default: {} },
    payment: { type: mongoose.Schema.Types.Mixed, default: {} },
    settings: { type: mongoose.Schema.Types.Mixed, default: {} },
    uiState: { type: mongoose.Schema.Types.Mixed, default: {} },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    customerName: { type: String, trim: true },
    invoiceNo: { type: String, trim: true },
    customerMobile: { type: String, trim: true },
    items: [
      {
        productId: { type: mongoose.Schema.Types.Mixed },
        mongoId: { type: String, trim: true },
        productName: { type: String, trim: true },
        productIdNumber: { type: Number },
        sku: { type: String, trim: true },
        barcode: { type: String, trim: true },
        localName: { type: String, trim: true },
        companyName: { type: String, trim: true },
        category: { type: String, trim: true },
        hsnCode: { type: String, trim: true },
        unit: { type: String, default: 'pcs', trim: true },
        quantity: { type: Number, min: 1, default: 1 },
        qty: { type: Number, min: 0, default: 0 },
        freeQuantity: { type: Number, min: 0, default: 0 },
        price: { type: Number, min: 0, default: 0 },
        rate: { type: Number, min: 0, default: 0 },
        purchasePrice: { type: Number, min: 0, default: 0 },
        sellingPrice: { type: Number, min: 0, default: 0 },
        wholesalePrice: { type: Number, min: 0, default: 0 },
        mrp: { type: Number, min: 0, default: 0 },
        gst: { type: Number, min: 0, default: 0 },
        gstAmount: { type: Number, min: 0, default: 0 },
        taxableAmount: { type: Number, min: 0, default: 0 },
        netAmount: { type: Number, min: 0, default: 0 },
        lineTotal: { type: Number, min: 0, default: 0 },
        discount: { type: Number, min: 0, default: 0 },
        discountPercent: { type: Number, min: 0, default: 0 },
        discountAmount: { type: Number, min: 0, default: 0 },
        gstInclusive: { type: Boolean, default: false },
        priceMode: { type: String, trim: true, default: 'retail' },
        stockAtSale: { type: Number, min: 0, default: 0 },
        total: { type: Number, min: 0, default: 0 },
        batch: { type: String, trim: true },
        expiry: { type: String, trim: true },
        remarks: { type: String, trim: true },
        metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
      }
    ],
    subtotal: { type: Number, min: 0, default: 0 },
    taxTotal: { type: Number, min: 0, default: 0 },
    discount: { type: Number, min: 0, default: 0 },
    discountPercent: { type: Number, min: 0, default: 0 },
    discountAmount: { type: Number, min: 0, default: 0 },
    total: { type: Number, min: 0, default: 0 },
    paymentMethod: {
      type: String,
      enum: ['Cash', 'UPI', 'Card', 'Credit', 'Cheque', 'Bank Transfer', 'Split', 'Wallet', 'Online'],
      default: 'Cash',
      set: (value) => {
        const normalized = String(value || '').trim().toLowerCase();
        if (normalized === 'upi') return 'UPI';
        if (normalized === 'cash') return 'Cash';
        if (normalized === 'card') return 'Card';
        if (normalized === 'credit') return 'Credit';
        if (normalized === 'cheque') return 'Cheque';
        if (normalized === 'bank' || normalized === 'bank_transfer' || normalized === 'bank transfer') return 'Bank Transfer';
        if (normalized === 'split') return 'Split';
        if (normalized === 'wallet') return 'Wallet';
        if (normalized === 'online') return 'Online';
        return value;
      }
    },
    paymentDetails: {
      type: [
        {
          method: { type: String, trim: true },
          amount: { type: Number, min: 0, default: 0 },
          reference: { type: String, trim: true }
        }
      ],
      default: []
    },
    cashReceived: { type: Number, min: 0, default: 0 },
    changeReturn: { type: Number, min: 0, default: 0 },
    paidAmount: { type: Number, min: 0, default: 0 },
    amountPaid: { type: Number, min: 0, default: 0 },
    balanceAmount: { type: Number, min: 0, default: 0 },
    balanceDue: { type: Number, min: 0, default: 0 },
    outstanding: { type: Number, min: 0, default: 0 },
    creditAmount: { type: Number, min: 0, default: 0 },
    heldBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    ,
    invoiceAt: { type: Date }
  },
  { timestamps: true }
);

holdBillSchema.index({ createdAt: -1 });
holdBillSchema.index({ customerMobile: 1, createdAt: -1 });
holdBillSchema.index({ invoiceNo: 1 });

const HoldBill = mongoose.model('HoldBill', holdBillSchema);
export default HoldBill;
