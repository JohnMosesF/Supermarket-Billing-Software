import { Product } from '../models/Product.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getCache, setCache } from '../utils/cache.js';

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Prefix-only product search for POS autocomplete.
 */
export const searchProducts = asyncHandler(async (req, res) => {
  const query = String(req.query.q || '').trim();
  const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 200);

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

  const numericQuery = /^[0-9]+$/.test(query);
  const prefixRegex = new RegExp(`^${escapeRegex(query)}`, 'i');
  const productIdExpr = numericQuery ? {
    $regexMatch: {
      input: { $toString: '$productId' },
      regex: `^${escapeRegex(query)}`
    }
  } : null;
  const prefixResults = await Product.find({
    active: true,
    $or: [
      { name: prefixRegex },
      { localName: prefixRegex },
      { sku: prefixRegex },
      { barcode: prefixRegex },
      ...(productIdExpr ? [{ $expr: productIdExpr }] : [])
    ]
  }, {
    productId: 1,
    name: 1,
    localName: 1,
    sku: 1,
    barcode: 1,
    sellingPrice: 1,
    stock: 1,
    taxRate: 1,
    category: 1,
    allowDecimalQty: 1,
    unit: 1,
  }).sort({ name: 1 }).limit(limit).lean();

  if (prefixResults && prefixResults.length > 0) {
    const payload = prefixResults.map((product) => ({
      _id: product._id,
      productId: product.productId,
      productName: product.name,
      name: product.name,
      localName: product.localName || '',
      sku: product.sku,
      barcode: product.barcode,
      sellingPrice: product.sellingPrice,
      stock: product.stock,
      taxRate: product.taxRate || 0,
      tax: product.taxRate || 0,
      available: product.stock > 0,
      allowDecimalQty: product.allowDecimalQty || false,
      unit: product.unit || 'pcs',
    }));
    setCache(cacheKey, payload, 10000);
    return res.json({ products: payload });
  }

  res.json({ products: [] });
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
    localName: 1,
    sku: 1,
    barcode: 1,
    sellingPrice: 1,
    stock: 1,
    taxRate: 1,
    category: 1,
    allowDecimalQty: 1,
    unit: 1,
  }).lean();

  if (!product) {
    return res.status(404).json({ message: 'Product not found' });
  }

  const payload = {
    _id: product._id,
    productId: product.productId,
    productName: product.name,
    name: product.name,
    localName: product.localName || '',
    sku: product.sku,
    barcode: product.barcode,
    sellingPrice: product.sellingPrice,
    stock: product.stock,
    taxRate: product.taxRate || 0,
    tax: product.taxRate || 0,
    available: product.stock > 0,
    allowDecimalQty: product.allowDecimalQty || false,
    unit: product.unit || 'pcs',
  };

  res.json({ product: payload });
});

/**
 * Resolve a POS scanner/search token by exact barcode, exact SKU, or exact numeric product ID.
 */
export const lookupProduct = asyncHandler(async (req, res) => {
  const code = String(req.params.code || req.query.code || '').trim();
  if (!code) return res.status(400).json({ message: 'Product lookup code is required' });

  const query = {
    active: true,
    $or: [
      { barcode: code },
      { sku: code.toUpperCase() },
      ...(/^[0-9]+$/.test(code) ? [{ productId: Number(code) }] : [])
    ]
  };

  const product = await Product.findOne(query, {
    productId: 1,
    name: 1,
    localName: 1,
    sku: 1,
    barcode: 1,
    sellingPrice: 1,
    retailPrice: 1,
    wholesalePrice: 1,
    mrp: 1,
    stock: 1,
    taxRate: 1,
    category: 1,
    allowDecimalQty: 1,
    unit: 1,
    gstInclusive: 1,
    hsnCode: 1
  }).lean();

  if (!product) return res.status(404).json({ message: 'Product not found' });

  res.json({
    product: {
      _id: product._id,
      productId: product.productId,
      productName: product.name,
      name: product.name,
      localName: product.localName || '',
      sku: product.sku,
      barcode: product.barcode,
      sellingPrice: product.sellingPrice,
      retailPrice: product.retailPrice,
      wholesalePrice: product.wholesalePrice,
      mrp: product.mrp,
      stock: product.stock,
      taxRate: product.taxRate || 0,
      tax: product.taxRate || 0,
      available: product.stock > 0,
      allowDecimalQty: product.allowDecimalQty || false,
      unit: product.unit || 'pcs',
      gstInclusive: Boolean(product.gstInclusive),
      hsnCode: product.hsnCode || ''
    }
  });
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
