import mongoose from 'mongoose';

const holdBillSchema = new mongoose.Schema(
  {
    customerName: { type: String, trim: true },
    invoiceNo: { type: String, trim: true },
    customerMobile: { type: String, trim: true },
    items: [
      {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
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
        price: { type: Number, min: 0, default: 0 },
        purchasePrice: { type: Number, min: 0, default: 0 },
        sellingPrice: { type: Number, min: 0, default: 0 },
        wholesalePrice: { type: Number, min: 0, default: 0 },
        mrp: { type: Number, min: 0, default: 0 },
        gst: { type: Number, min: 0, default: 0 },
        gstAmount: { type: Number, min: 0, default: 0 },
        taxableAmount: { type: Number, min: 0, default: 0 },
        netAmount: { type: Number, min: 0, default: 0 },
        discount: { type: Number, min: 0, default: 0 },
        stockAtSale: { type: Number, min: 0, default: 0 },
        total: { type: Number, min: 0, default: 0 }
      }
    ],
    subtotal: { type: Number, min: 0, default: 0 },
    taxTotal: { type: Number, min: 0, default: 0 },
    discount: { type: Number, min: 0, default: 0 },
    total: { type: Number, min: 0, default: 0 },
    paymentMethod: {
      type: String,
      enum: ['Cash', 'UPI', 'Card', 'Cheque', 'Wallet', 'Online'],
      default: 'Cash',
      set: (value) => {
        const normalized = String(value || '').trim().toLowerCase();
        if (normalized === 'upi') return 'UPI';
        if (normalized === 'cash') return 'Cash';
        if (normalized === 'card') return 'Card';
        if (normalized === 'cheque') return 'Cheque';
        if (normalized === 'wallet') return 'Wallet';
        if (normalized === 'online') return 'Online';
        return value;
      }
    },
    heldBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    ,
    invoiceAt: { type: Date }
  },
  { timestamps: true }
);

const HoldBill = mongoose.model('HoldBill', holdBillSchema);
export default HoldBill;
