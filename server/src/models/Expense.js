import mongoose from 'mongoose';

const attachmentSchema = new mongoose.Schema(
  {
    filename: String,
    originalName: String,
    mimetype: String,
    size: Number,
    path: String,
    url: String
  },
  { _id: false }
);

const expenseSchema = new mongoose.Schema(
  {
    expenseNo: { type: String, required: true, unique: true, trim: true, index: true },
    expenseDate: { type: Date, required: true, default: Date.now, index: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'ExpenseCategory', required: true, index: true },
    categoryName: { type: String, trim: true },
    expenseName: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    amount: { type: Number, required: true, min: 0.01 },
    gstAmount: { type: Number, min: 0, default: 0 },
    totalAmount: { type: Number, required: true, min: 0.01 },
    paymentMethod: {
      type: String,
      enum: ['Cash', 'UPI', 'Card', 'Bank', 'Cheque', 'Wallet'],
      required: true,
      index: true
    },
    referenceNumber: { type: String, trim: true, index: true },
    vendor: { type: String, trim: true, index: true },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', index: true },
    supplierSnapshot: {
      name: String,
      mobile: String,
      email: String,
      gstNumber: String,
      address: String
    },
    attachment: attachmentSchema,
    remarks: { type: String, trim: true },
    taxableAmount: { type: Number, min: 0, default: 0 },
    gstInclusive: { type: Boolean, default: false },
    gstExclusive: { type: Boolean, default: true },
    preparedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    approvalDate: Date,
    approvalStatus: { type: String, enum: ['Draft', 'Pending Approval', 'Approved', 'Rejected', 'Posted', 'Cancelled'], default: 'Posted', index: true },
    status: { type: String, enum: ['Draft', 'Pending Approval', 'Approved', 'Rejected', 'Posted', 'Cancelled', 'Deleted'], default: 'Posted', index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    cancelledAt: Date,
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    cancellationReason: String,
    deletedAt: Date,
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    restoredAt: Date,
    restoredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reprintCount: { type: Number, default: 0 },
    voucherAudit: [{
      action: { type: String, enum: ['Printed', 'Reprinted', 'Downloaded', 'Exported'], required: true },
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      userName: String,
      voucherNo: String,
      at: { type: Date, default: Date.now }
    }]
  },
  { timestamps: true }
);

expenseSchema.index({ expenseDate: -1, status: 1 });
expenseSchema.index({ category: 1, expenseDate: -1 });
expenseSchema.index({ paymentMethod: 1, expenseDate: -1 });
expenseSchema.index({ vendor: 1, expenseDate: -1 });
expenseSchema.index({ supplier: 1, expenseDate: -1 });
expenseSchema.index({ preparedBy: 1, expenseDate: -1 });
expenseSchema.index({ approvalStatus: 1, expenseDate: -1 });
expenseSchema.index({ expenseName: 'text', description: 'text', vendor: 'text', remarks: 'text', expenseNo: 'text', referenceNumber: 'text' });

export const Expense = mongoose.model('Expense', expenseSchema);
