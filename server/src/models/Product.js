import mongoose from 'mongoose';

const productSchema = new mongoose.Schema(
  {
    // Numeric product ID (auto-generated, primary identifier for POS)
    productId: { type: Number, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true, index: true },
    sku: { type: String, required: true, unique: true, uppercase: true, trim: true },
    barcode: { type: String, trim: true, unique: true, sparse: true, index: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand' },
    purchasePrice: { type: Number, required: true, min: 0 },
    sellingPrice: { type: Number, required: true, min: 0 },
    retailPrice: { type: Number, min: 0 },
    taxRate: { type: Number, default: 0, min: 0 },
    gstInclusive: { type: Boolean, default: false },
    stock: { type: Number, default: 0 },
    lowStockThreshold: { type: Number, default: 5, min: 0 },
    unit: { type: String, default: 'pcs', lowercase: true, trim: true },
    allowDecimalQty: { type: Boolean, default: false },
    localName: String,
    mrp: Number,
    wholesalePrice: Number,
    openingStock: Number,
    companyName: String,
    hsnCode: String,
    discount: Number,
    description: String,

    imageUrl: String,
    active: { type: Boolean, default: true }
    
  },
  { timestamps: true }
);

// Indexes for fast searching
productSchema.index({ name: 1 });
productSchema.index({ sku: 1 });
productSchema.index({ barcode: 1 });
productSchema.index({ productId: 1 });
productSchema.index({ active: 1 });

export const Product = mongoose.model('Product', productSchema);
