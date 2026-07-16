import mongoose from 'mongoose';

const printLogSchema = new mongoose.Schema(
  {
    invoiceNo: { type: String, trim: true },
    printer: { type: String, trim: true },
    paperWidth: { type: String, trim: true },
    duplicateCopy: { type: Boolean, default: false },
    printedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    success: { type: Boolean, required: true, default: true },
    error: { type: String, trim: true }
  },
  { timestamps: true }
);

printLogSchema.index({ invoiceNo: 1, createdAt: -1 });

const PrintLog = mongoose.model('PrintLog', printLogSchema);
export default PrintLog;
