import { api } from '../api/http.js';

// Bills API
export const billingAPI = {
  searchProducts: (query, limit = 12) =>
    api.get('/products/search', { params: { q: query, limit } }),

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
