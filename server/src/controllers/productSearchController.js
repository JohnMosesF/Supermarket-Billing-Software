import { Product } from '../models/Product.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { fuzzySearchProducts, stringSimilarity, extractKeywords } from '../utils/fuzzySearch.js';
import { getCache, setCache } from '../utils/cache.js';

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

  // Try cache first
  const cacheKey = `prod_search:${query}:${limit}`;
  const cached = getCache(cacheKey);
  if (cached) {
    return res.json({ products: cached });
  }

  // Fast paths using DB queries to avoid loading entire product collection
  const numericQuery = /^[0-9]+$/.test(query);

  if (numericQuery) {
    // exact productId match
    const prod = await Product.findOne({ productId: Number(query), active: true }, {
      productId: 1,
      name: 1,
      sku: 1,
      barcode: 1,
      sellingPrice: 1,
      stock: 1,
      taxRate: 1,
      category: 1,
    }).lean();

    if (prod) {
      const payload = [{
        _id: prod._id,
        productId: prod.productId,
        productName: prod.name,
        name: prod.name,
        sku: prod.sku,
        barcode: prod.barcode,
        sellingPrice: prod.sellingPrice,
        stock: prod.stock,
        taxRate: prod.taxRate || 0,
        tax: prod.taxRate || 0,
        available: prod.stock > 0,
      }];
      setCache(cacheKey, payload, 15000);
      return res.json({ products: payload });
    }
  }

  // Prefix search on name/sku using indexed queries
  const prefixRegex = new RegExp(`^${escapeRegex(query)}`, 'i');
  const prefixResults = await Product.find({ active: true, $or: [{ name: prefixRegex }, { sku: prefixRegex }] }, {
    productId: 1,
    name: 1,
    sku: 1,
    barcode: 1,
    sellingPrice: 1,
    stock: 1,
    taxRate: 1,
    category: 1,
  }).limit(limit).lean();

  if (prefixResults && prefixResults.length > 0) {
    const payload = prefixResults.map((product) => ({
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
    setCache(cacheKey, payload, 10000);
    return res.json({ products: payload });
  }

  // Reduce candidate set for fuzzy search by matching first keyword (contains)
  const firstWord = query.split(/\s+/)[0];
  const containsRegex = new RegExp(escapeRegex(firstWord), 'i');
  const candidates = await Product.find({ active: true, $or: [{ name: containsRegex }, { sku: containsRegex }, { barcode: containsRegex }] }, {
    productId: 1,
    name: 1,
    sku: 1,
    barcode: 1,
    sellingPrice: 1,
    stock: 1,
    taxRate: 1,
    category: 1,
  }).limit(1000).lean();

  // Apply fuzzy search to candidate subset
  const searchResults = fuzzySearchProducts(query, candidates);

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
