import mongoose from 'mongoose';

const draftBillSchema = new mongoose.Schema(
  {
    invoiceNo: { type: String, trim: true },
    customerName: { type: String, trim: true },
    customerMobile: { type: String, trim: true },
    items: [
      {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        productName: { type: String, trim: true },
        quantity: { type: Number, min: 0.001, default: 1 },
        price: { type: Number, min: 0, default: 0 },
        total: { type: Number, min: 0, default: 0 }
      }
    ],
    subtotal: { type: Number, min: 0, default: 0 },
    discount: { type: Number, min: 0, default: 0 },
    total: { type: Number, min: 0, default: 0 },
    savedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

const DraftBill = mongoose.model('DraftBill', draftBillSchema);
export default DraftBill;
