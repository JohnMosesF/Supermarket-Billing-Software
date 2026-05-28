import mongoose from 'mongoose';

const printLogSchema = new mongoose.Schema(
  {
    invoiceNo: { type: String, trim: true },
    printer: { type: String, trim: true },
    success: { type: Boolean, required: true, default: true },
    error: { type: String, trim: true }
  },
  { timestamps: true }
);

const PrintLog = mongoose.model('PrintLog', printLogSchema);
export default PrintLog;
