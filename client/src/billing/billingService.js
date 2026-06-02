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
    sku: product.sku || '',
    barcode: product.barcode || '',
    sellingPrice: Number(product.sellingPrice ?? product.price ?? product.rate ?? 0),
    stock: Number(product.stock ?? 0),
    taxRate: Number(product.taxRate ?? product.tax ?? 0),
    tax: Number(product.taxRate ?? product.tax ?? 0),
    category: product.category,
    available: Number(product.stock ?? 0) > 0,
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

// Product API
export const productAPI = {
  // Search products with fuzzy matching (client caches recent queries)
  searchProducts: (query, limit = 12) => {
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

  // Get today's sales
  getTodaysSales: () => api.get('/bills/stats/today'),

  // Get open bills
  getOpenBills: () => api.get('/bills/open'),

  // Get customer bills
  getCustomerBills: (customerMobile) => api.get('/bills/customer', { params: { mobile: customerMobile } }),

  // Reprint bill
  reprintBill: (billId) => api.get(`/bills/${billId}/print`),
};

// Customer API
export const customerAPI = {
  searchCustomers: (search) => api.get('/customers', { params: { search } }),
  createCustomer: (customer) => api.post('/customers', customer),
};

// Hold Bills API
export const holdBillAPI = {
  // Save held bill
  holdBill: (data) => api.post('/hold-bills', data),

  // Get held bills
  getHeldBills: () => api.get('/hold-bills'),

  // Resume held bill
  resumeHeldBill: (heldBillId) => api.get(`/hold-bills/${heldBillId}`),

  // Delete held bill
  deleteHeldBill: (heldBillId) => api.delete(`/hold-bills/${heldBillId}`),
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
  logPrint: (data) => api.post('/print-logs', data),
};
