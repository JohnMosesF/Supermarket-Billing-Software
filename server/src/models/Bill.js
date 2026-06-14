import mongoose from 'mongoose';

const billItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
    tax: { type: Number, required: true, min: 0, default: 0 },
    total: { type: Number, required: true, min: 0 }
  },
  { _id: false }
);

const billSchema = new mongoose.Schema(
  {
    invoiceNo: { type: String, required: true, unique: true, trim: true },
    invoiceNumber: { type: String, trim: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    customerName: { type: String, trim: true, default: 'Walk-in Customer' },
    customerMobile: { type: String, trim: true },
    customerEmail: { type: String, trim: true },
    customerAddress: { type: String, trim: true },
    items: { type: [billItemSchema], required: true, validate: [(items) => items.length > 0, 'Bill must contain at least one item'] },
    subtotal: { type: Number, required: true, min: 0 },
    taxTotal: { type: Number, required: true, min: 0, default: 0 },
    discount: { type: Number, required: true, min: 0, default: 0 },
    discountPercent: { type: Number, min: 0, default: 0 },
    notes: { type: String, trim: true },
    total: { type: Number, required: true, min: 0 },
    paidAmount: { type: Number, required: true, min: 0, default: 0 },
    balanceAmount: { type: Number, required: true, min: 0, default: 0 },
    dueAmount: { type: Number, required: true, min: 0, default: 0 },
    paymentStatus: {
      type: String,
      enum: ['Paid', 'Partial', 'Unpaid'],
      required: true,
      default: 'Paid'
    },
    invoiceAt: { type: Date },
    paymentMethod: {
      type: String,
      enum: ['Cash', 'UPI', 'Card', 'Credit'],
      required: true,
      default: 'Cash',
      set: (value) => {
        const normalized = String(value || '').trim().toLowerCase();
        if (normalized === 'upi') return 'UPI';
        if (normalized === 'cash') return 'Cash';
        if (normalized === 'card') return 'Card';
        if (normalized === 'credit') return 'Credit';
        return value;
      }
    },
    status: {
      type: String,
      enum: ['Completed', 'Hold', 'Cancelled', 'Refunded'],
      required: true,
      default: 'Completed'
    },
    staff: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

billSchema.pre('validate', function (next) {
  if (!this.invoiceNumber && this.invoiceNo) {
    this.invoiceNumber = this.invoiceNo;
  }
  if (!this.invoiceNo && this.invoiceNumber) {
    this.invoiceNo = this.invoiceNumber;
  }
  next();
});

const Bill = mongoose.model('Bill', billSchema);
export default Bill;
