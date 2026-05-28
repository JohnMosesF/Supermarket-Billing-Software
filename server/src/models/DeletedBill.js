import mongoose from 'mongoose';

const deletedBillSchema = new mongoose.Schema(
  {
    invoiceNo: { type: String, required: true, trim: true },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, trim: true },
    originalData: { type: mongoose.Schema.Types.Mixed, required: true }
  },
  { timestamps: true }
);

const DeletedBill = mongoose.model('DeletedBill', deletedBillSchema);
export default DeletedBill;
