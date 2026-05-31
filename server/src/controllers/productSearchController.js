import { Product } from '../models/Product.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { fuzzySearchProducts, stringSimilarity, extractKeywords } from '../utils/fuzzySearch.js';

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Advanced product search with fuzzy matching, keyword support, and multiple field search
 */
export const searchProducts = asyncHandler(async (req, res) => {
  const query = String(req.query.q || '').trim();
  const limit = Math.min(Math.max(Number(req.query.limit || 12), 1), 50);

  console.log(`Product search request: q=${query} limit=${limit}`);

  if (!query) {
    return res.json({ products: [] });
  }

  // First, try to fetch all active products
  const allProducts = await Product.find({ active: true }, {
    productId: 1,
    name: 1,
    sku: 1,
    barcode: 1,
    sellingPrice: 1,
    stock: 1,
    taxRate: 1,
    category: 1,
  }).lean();

  // Apply fuzzy search to all products
  const searchResults = fuzzySearchProducts(query, allProducts);

  // Take top results up to limit
  const topResults = searchResults.slice(0, limit);

  const payload = topResults.map((product) => ({
    _id: product._id,
    productId: product.productId,
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

  console.log(`Found ${payload.length} products matching "${query}"`);
  res.json({ products: payload });
});

/**
 * Search products by numeric product ID
 */
export const searchByProductId = asyncHandler(async (req, res) => {
  const productId = Number(req.params.productId);
  
  if (isNaN(productId)) {
    return res.status(400).json({ message: 'Invalid product ID' });
  }

  const product = await Product.findOne({ productId, active: true }, {
    productId: 1,
    name: 1,
    sku: 1,
    barcode: 1,
    sellingPrice: 1,
    stock: 1,
    taxRate: 1,
    category: 1,
  }).lean();

  if (!product) {
    return res.status(404).json({ message: 'Product not found' });
  }

  const payload = {
    _id: product._id,
    productId: product.productId,
    productName: product.name,
    name: product.name,
    sku: product.sku,
    barcode: product.barcode,
    sellingPrice: product.sellingPrice,
    stock: product.stock,
    taxRate: product.taxRate || 0,
    tax: product.taxRate || 0,
    available: product.stock > 0,
  };

  res.json({ product: payload });
});

/**
 * Get next available product ID
 */
export const getNextProductId = asyncHandler(async (req, res) => {
  const lastProduct = await Product.findOne()
    .sort({ productId: -1 })
    .lean();

  const nextId = (lastProduct?.productId || 1000) + 1;
  res.json({ nextProductId: nextId });
});
