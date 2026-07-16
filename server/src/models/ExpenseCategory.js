import mongoose from 'mongoose';

const expenseCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    description: { type: String, trim: true },
    active: { type: Boolean, default: true },
    deletedAt: Date,
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

expenseCategorySchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
expenseCategorySchema.index({ code: 1 }, { unique: true });
expenseCategorySchema.index({ active: 1, name: 1 });

export const ExpenseCategory = mongoose.model('ExpenseCategory', expenseCategorySchema);
