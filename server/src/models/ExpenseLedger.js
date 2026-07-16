import mongoose from 'mongoose';

const expenseLedgerSchema = new mongoose.Schema(
  {
    expense: { type: mongoose.Schema.Types.ObjectId, ref: 'Expense', required: true, index: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'ExpenseCategory', index: true },
    voucherNo: { type: String, required: true, index: true },
    expenseName: String,
    debit: { type: Number, default: 0 },
    credit: { type: Number, default: 0 },
    balance: { type: Number, default: 0 },
    paymentMethod: String,
    remarks: String,
    transactionDate: { type: Date, required: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    sourceKey: { type: String, required: true, unique: true }
  },
  { timestamps: true }
);

expenseLedgerSchema.index({ transactionDate: 1, _id: 1 });
expenseLedgerSchema.index({ category: 1, transactionDate: 1 });
expenseLedgerSchema.index({ paymentMethod: 1, transactionDate: 1 });

export const ExpenseLedger = mongoose.model('ExpenseLedger', expenseLedgerSchema);
