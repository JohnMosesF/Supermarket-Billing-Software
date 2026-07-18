import { api } from '../api/http.js';

// Simple in-memory cache for client-side API calls
const clientCache = new Map();
function getClientCache(key) {
  const e = clientCache.get(key);
  if (!e) return null;
  if (Date.now() > e.expires) {
    clientCache.delete(key);
    return null;
  }
  return e.value;
}
function setClientCache(key, value, ttl = 10000) {
  clientCache.set(key, { value, expires: Date.now() + ttl });
}

function normalizeProductResult(product) {
  const normalized = {
    _id: product._id,
    productId: product.productId != null ? Number(product.productId) : undefined,
    name: product.name || product.productName || '',
    productName: product.productName || product.name || '',
    localName: product.localName || '',
    sku: product.sku || '',
    unit: product.unit || '',
    barcode: product.barcode || '',
    sellingPrice: Number(product.sellingPrice ?? product.price ?? product.rate ?? 0),
    retailPrice: Number(product.retailPrice ?? product.sellingPrice ?? product.price ?? product.rate ?? 0),
    wholesalePrice: Number(product.wholesalePrice ?? product.sellingPrice ?? product.price ?? product.rate ?? 0),
    mrp: Number(product.mrp ?? product.sellingPrice ?? product.price ?? product.rate ?? 0),
    stock: Number(product.stock ?? 0),
    taxRate: Number(product.taxRate ?? product.tax ?? 0),
    tax: Number(product.taxRate ?? product.tax ?? 0),
    category: product.category,
    available: Number(product.stock ?? 0) > 0,
    unit: product.unit || 'pcs',
    allowDecimalQty: Boolean(product.allowDecimalQty),
    gstInclusive: Boolean(product.gstInclusive),
    hsnCode: product.hsnCode || '',
  };
  if (normalized.productId === 0) normalized.productId = undefined;
  return normalized;
}

function dedupeProducts(products) {
  const seen = new Set();
  return products.filter((product) => {
    const key = String(product.productId ?? product._id ?? product.sku ?? product.barcode ?? '').trim();
    if (!key) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function productMatchesSearch(product, query) {
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return false;

  return [
    product.productId,
    product.sku,
    product.productName,
    product.name,
    product.localName,
    product.barcode,
  ].some((value) => String(value ?? '').toLowerCase().startsWith(needle));
}

function productNameStartsWith(product, query) {
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return false;

  const productName = String(product.productName || product.name || '').trim().toLowerCase();
  return [
    product.productId,
    product.sku,
    product.barcode,
    product.productName,
    product.name,
    product.localName
  ].some((value) => String(value ?? '').trim().toLowerCase().startsWith(needle));
}

function filterProducts(products, query, limit = 100) {
  const max = Math.max(Number(limit || 100), 1);
  return products.filter((product) => productMatchesSearch(product, query)).slice(0, max);
}

function filterProductsByNamePrefix(products, query, limit = 100) {
  const max = Math.max(Number(limit || 100), 1);
  return products.filter((product) => productNameStartsWith(product, query)).slice(0, max);
}

// Product API
export const productAPI = {
  listProducts: (limit = 10000) => {
    const key = `prod_list:${limit}`;
    const cached = getClientCache(key);
    if (cached) return Promise.resolve({ data: { products: cached } });
    return api.get('/products', { params: { limit } }).then((res) => {
      const products = (res.data && (res.data.products || res.data)) || [];
      const normalized = dedupeProducts(products.map(normalizeProductResult));
      setClientCache(key, normalized, 60000);
      return { data: { products: normalized } };
    });
  },

  filterProducts,
  filterProductsByNamePrefix,

  // Prefix-only product search with short local cache for POS autocomplete
  searchProducts: (query, limit = 100) => {
    const key = `prod_search:${query}:${limit}`;
    const cached = getClientCache(key);
    if (cached) return Promise.resolve({ data: { products: cached } });
    return api.get('/products/search', { params: { q: query, limit } }).then((res) => {
      const products = (res.data && (res.data.products || res.data)) || [];
      const normalized = dedupeProducts(products.map(normalizeProductResult));
      setClientCache(key, normalized, 8000);
      return { data: { products: normalized } };
    });
  },

  lookupProduct: (code) => api.get(`/products/lookup/${encodeURIComponent(code)}`).then((res) => {
    const product = normalizeProductResult(res.data.product || {});
    return { data: { product } };
  }),

  // Get product by numeric ID
  getProductById: (productId) => {
    const key = `prod_id:${productId}`;
    const cached = getClientCache(key);
    if (cached) return Promise.resolve({ data: { product: cached } });
    return api.get(`/products/id/${productId}`).then((res) => {
      const product = normalizeProductResult(res.data.product || {});
      setClientCache(key, product, 30000);
      return { data: { product } };
    });
  },

  // Get product by MongoDB object ID
  getProductByObjectId: (productId) => {
    return api.get(`/products/${productId}`).then((res) => {
      const product = normalizeProductResult(res.data.product || {});
      return { data: { product } };
    });
  },

  // Get next available product ID
  getNextProductId: () => api.get('/products/next-id'),
  
  // List products with low stock
  listLowStock: (limit = 50) => api.get('/products', { params: { lowStock: true, limit } }),
};

// Bills API
export const billingAPI = {
  // Create new bill
  createBill: (data) => api.post('/bills', data),

  // Get bill by ID
  getBill: (billId) => api.get(`/bills/${billId}`),

  // Update bill
  updateBill: (billId, data) => api.put(`/bills/${billId}`, data),

  // Soft delete bill
  deleteBill: (billId, reason) => api.post(`/bills/${billId}/delete`, { reason }),

  // Get all bills with filters
  getBills: (filters) => api.get('/bills', { params: filters }),

  // Search bills
  searchBills: (query) => api.get('/bills/search', { params: { q: query } }),

  // Get deleted bills
  getDeletedBills: () => api.get('/bills/deleted'),
  restoreDeletedBill: (billId) => api.post(`/bills/deleted/${billId}/restore`),
  permanentlyDeleteDeletedBill: (billId) => api.delete(`/bills/deleted/${billId}`),

  // Get today's sales
  getTodaysSales: () => api.get('/bills/stats/today'),

  // Get open bills
  getOpenBills: () => api.get('/bills/open'),

  // Get customer bills
  getCustomerBills: (customerMobile) => api.get('/bills/customer', { params: { mobile: customerMobile } }),

};

// Customer API
export const customerAPI = {
  getCustomers: (params = {}) => api.get('/customers', { params }),
  searchCustomers: (search) => api.get('/customers', { params: { search } }),
  getCustomer: (customerId) => api.get(`/customers/${customerId}`),
  createCustomer: (customer) => api.post('/customers', customer),
};

// Hold Bills API (aligned with server routes under /bills)
export const holdBillAPI = {
  // Save held bill
  holdBill: (data) => api.post('/bills/hold', data),

  // Update existing held bill
  updateHeldBill: (heldBillId, data) => api.put(`/bills/hold/${heldBillId}`, data),

  // Get held bills
  getHeldBills: (params = {}) => api.get('/bills/hold/all', { params }),

  // Resume held bill
  resumeHeldBill: (heldBillId) => api.get(`/bills/hold/${heldBillId}`),

  // Delete held bill
  deleteHeldBill: (heldBillId) => api.delete(`/bills/hold/${heldBillId}`),
};

// Refund API
export const refundAPI = {
  // Create refund
  createRefund: (data) => api.post('/refunds', data),

  // Get refunds
  getRefunds: (filters) => api.get('/refunds', { params: filters }),
};

// Print Logs API
export const printLogAPI = {
  // Log print attempt
  logPrint: (data) => api.post('/bills/print-logs', data),
};
