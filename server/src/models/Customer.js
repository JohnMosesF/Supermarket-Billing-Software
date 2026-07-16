import mongoose from 'mongoose';

const creditTransactionSchema = new mongoose.Schema(
  {
    billId: { type: mongoose.Schema.Types.ObjectId, required: true },
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
    customerId: { type: String, trim: true, unique: true, sparse: true },
    name: { type: String, required: true, trim: true },
    mobile: { type: String, required: true, unique: true, trim: true },
    alternatePhone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    address: String,
    city: String,
    state: String,
    pincode: String,
    gstNumber: { type: String, trim: true, uppercase: true },
    panNumber: { type: String, trim: true, uppercase: true },
    openingBalance: { type: Number, default: 0 },
    creditLimit: { type: Number, default: 0, min: 0 },
    remarks: String,
    notes: String,
    loyaltyPoints: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
    totalCredit: { type: Number, default: 0 },
    totalPaid: { type: Number, default: 0 },
    outstandingBalance: { type: Number, default: 0 },
    creditBalance: { type: Number, default: 0 },
    totalCreditSales: { type: Number, default: 0 },
    totalPaidAmount: { type: Number, default: 0 },
    lastCreditDate: Date,
    lastPaymentDate: Date,
    creditTransactions: { type: [creditTransactionSchema], default: [] },
    creditHistory: { type: [creditTransactionSchema], default: [] },
    paymentHistory: { type: [creditPaymentSchema], default: [] },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

customerSchema.index({ name: 1 });
customerSchema.index({ mobile: 1 });
customerSchema.index({ gstNumber: 1 });

export const Customer = mongoose.model('Customer', customerSchema);
