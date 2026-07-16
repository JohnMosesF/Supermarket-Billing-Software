import mongoose from 'mongoose';

const stockAdjustmentSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    adjustmentType: {
      type: String,
      enum: ['Increase', 'Decrease', 'Damage', 'Expired', 'Lost', 'Opening Correction'],
      required: true,
      index: true
    },
    currentStock: { type: Number, required: true },
    adjustedQuantity: { type: Number, required: true, min: 0.001 },
    resultingStock: { type: Number, required: true },
    reason: { type: String, required: true, trim: true },
    remarks: { type: String, trim: true },
    adjustedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    adjustmentDate: { type: Date, default: Date.now, index: true },
    stockMovement: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryLog' }
  },
  { timestamps: true }
);

export const StockAdjustment = mongoose.model('StockAdjustment', stockAdjustmentSchema);
