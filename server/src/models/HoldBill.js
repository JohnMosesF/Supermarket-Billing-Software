import mongoose from 'mongoose';

const holdBillSchema = new mongoose.Schema(
  {
    customerName: { type: String, trim: true },
    invoiceNo: { type: String, trim: true },
    customerMobile: { type: String, trim: true },
    items: [
      {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        productName: { type: String, trim: true },
        quantity: { type: Number, min: 1, default: 1 },
        price: { type: Number, min: 0, default: 0 },
        tax: { type: Number, min: 0, default: 0 },
        total: { type: Number, min: 0, default: 0 }
      }
    ],
    subtotal: { type: Number, min: 0, default: 0 },
    discount: { type: Number, min: 0, default: 0 },
    total: { type: Number, min: 0, default: 0 },
    paymentMethod: {
      type: String,
      enum: ['Cash', 'UPI', 'Card'],
      default: 'Cash',
      set: (value) => {
        const normalized = String(value || '').trim().toLowerCase();
        if (normalized === 'upi') return 'UPI';
        if (normalized === 'cash') return 'Cash';
        if (normalized === 'card') return 'Card';
        return value;
      }
    },
    heldBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

const HoldBill = mongoose.model('HoldBill', holdBillSchema);
export default HoldBill;
