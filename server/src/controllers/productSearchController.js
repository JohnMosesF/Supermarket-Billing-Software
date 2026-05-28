import { Product } from '../models/Product.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const searchProducts = asyncHandler(async (req, res) => {
  const query = String(req.query.q || '').trim();
  const limit = Math.min(Math.max(Number(req.query.limit || 12), 1), 50);

  console.log(`Product search request: q=${query} limit=${limit}`);

  if (!query) {
    return res.json({ products: [] });
  }

  const regex = new RegExp(escapeRegex(query), 'i');
  const filter = {
    active: true,
    $or: [{ name: regex }, { sku: regex }, { barcode: regex }],
  };

  const products = await Product.find(filter, {
    name: 1,
    sku: 1,
    barcode: 1,
    sellingPrice: 1,
    stock: 1,
    taxRate: 1,
  })
    .sort({ name: 1 })
    .limit(limit);

  const payload = products.map((product) => ({
    _id: product._id,
    productName: product.name,
    name: product.name,
    sku: product.sku,
    barcode: product.barcode,
    sellingPrice: product.sellingPrice,
    stock: product.stock,
    taxRate: product.taxRate || 0,
    tax: product.taxRate || 0,
    available: product.stock > 0,
  }));

  res.json({ products: payload });
});
