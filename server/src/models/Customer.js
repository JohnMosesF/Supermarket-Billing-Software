import mongoose from 'mongoose';

const creditTransactionSchema = new mongoose.Schema(
  {
    billId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', required: true },
    billModel: { type: String, enum: ['Sale', 'Bill'], default: 'Sale' },
    invoiceNo: { type: String, required: true, trim: true },
    billAmount: { type: Number, required: true, min: 0 },
    paidAmount: { type: Number, required: true, min: 0 },
    dueAmount: { type: Number, required: true, min: 0 },
    paymentMethod: {
      type: String,
      enum: ['Cash', 'UPI', 'Card', 'Bank Transfer', 'Credit', 'Cheque', 'Wallet', 'Online'],
      required: true
    },
    paymentStatus: {
      type: String,
      enum: ['Paid', 'Partial', 'Unpaid'],
      required: true
    },
    date: { type: Date, default: Date.now }
  }
);

const creditPaymentSchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true, min: 0 },
    paymentMethod: {
      type: String,
      enum: ['Cash', 'UPI', 'Card', 'Bank Transfer'],
      required: true
    },
    notes: String,
    receiptNo: { type: String, required: true, trim: true },
    date: { type: Date, default: Date.now },
    appliedTo: [
      {
        billId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale' },
        invoiceNo: String,
        amount: { type: Number, min: 0 }
      }
    ]
  }
);

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    mobile: { type: String, required: true, unique: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    address: String,
    loyaltyPoints: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
    totalCredit: { type: Number, default: 0 },
    totalPaid: { type: Number, default: 0 },
    outstandingBalance: { type: Number, default: 0 },
    lastPaymentDate: Date,
    creditTransactions: { type: [creditTransactionSchema], default: [] },
    paymentHistory: { type: [creditPaymentSchema], default: [] }
  },
  { timestamps: true }
);

customerSchema.index({ name: 'text', mobile: 'text', email: 'text' });

export const Customer = mongoose.model('Customer', customerSchema);
