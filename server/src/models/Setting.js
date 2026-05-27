import mongoose from 'mongoose';

const settingSchema = new mongoose.Schema(
  {
    storeName: { type: String, default: 'FreshMart Supermarket' },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
    address: { type: String, default: '' },
    gstNumber: { type: String, default: '' },
    currency: { type: String, default: 'INR' },
    taxInclusive: { type: Boolean, default: false },
    defaultTaxRate: { type: Number, default: 0 },
    invoicePrefix: { type: String, default: 'INV' },
    invoiceFooter: { type: String, default: 'Thank you for shopping with us.' },
    printerName: { type: String, default: '' },
    thermalPaperWidth: { type: String, enum: ['58mm', '80mm'], default: '80mm' },
    lowStockGlobalThreshold: { type: Number, default: 5 }
  },
  { timestamps: true }
);

export const Setting = mongoose.model('Setting', settingSchema);
