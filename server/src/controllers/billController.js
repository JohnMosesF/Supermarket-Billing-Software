import Bill from '../models/Bill.js';
import { Customer } from '../models/Customer.js';
import DraftBill from '../models/DraftBill.js';
import DeletedBill from '../models/DeletedBill.js';
import PrintLog from '../models/PrintLog.js';
import HoldBill from '../models/HoldBill.js';
import { Product } from '../models/Product.js';
import { Setting } from '../models/Setting.js';
import { makeInvoiceNumber } from '../utils/invoice.js';
import { InventoryLog } from '../models/InventoryLog.js';
import { Unit } from '../models/Unit.js';
import { ensureDefaultUnits } from './unitController.js';
import mongoose from 'mongoose';
import Refund from '../models/Refund.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { normalizeBillItemSnapshot } from '../utils/billItemSnapshot.js';
import { reconcileCustomerAccounting, rebuildDayBook } from '../services/accountingService.js';
import { logAudit } from '../utils/audit.js';

function normalizePaymentMethod(value) {
  const normalized = String(value || 'Cash').trim().toLowerCase();
  if (normalized === 'upi') return 'UPI';
  if (normalized === 'card') return 'Card';
  if (normalized === 'credit') return 'Credit';
  if (normalized === 'cheque') return 'Cheque';
  if (normalized === 'bank' || normalized === 'bank_transfer' || normalized === 'bank transfer') return 'Bank Transfer';
  if (normalized === 'split') return 'Split';
  if (normalized === 'wallet') return 'Wallet';
  if (normalized === 'online') return 'Online';
  return 'Cash';
}

function normalizePaymentDetails(body, total, paymentMethod) {
  const raw = Array.isArray(body.paymentDetails) ? body.paymentDetails : Array.isArray(body.splitPayments) ? body.splitPayments : [];
  const details = raw
    .map((entry) => ({
      method: normalizePaymentMethod(entry.method || entry.paymentMethod),
      amount: Number(entry.amount || 0),
      reference: String(entry.reference || '').trim()
    }))
    .filter((entry) => entry.amount > 0);

  if (details.length) return details;
  const paid = requestPaidAmount(body, paymentMethod === 'Credit' ? 0 : total);
  return paid > 0 ? [{ method: paymentMethod, amount: paid, reference: String(body.paymentReference || '').trim() }] : [];
}

async function generateUniqueInvoiceNo(requestedNo) {
  if (requestedNo) {
    const duplicate = await Bill.exists({ invoiceNo: requestedNo });
    if (duplicate) throw new ApiError(409, 'Invoice number already exists');
    return requestedNo;
  }

  const settings = await Setting.findOne().lean();
  const prefix = settings?.invoicePrefix || 'INV';
  let count = await Bill.countDocuments();
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const candidate = makeInvoiceNumber(count + attempt, prefix);
    const exists = await Bill.exists({ invoiceNo: candidate });
    if (!exists) return candidate;
  }
  throw new ApiError(409, 'Unable to generate a unique invoice number');
}

function paymentStatusFromAmounts(total, paid) {
  if (paid >= total) return 'Paid';
  if (paid > 0) return 'Partial';
  return 'Unpaid';
}

function requestPaidAmount(body, fallback = 0) {
  return Number(body.paidAmount ?? body.amountPaid ?? body.paid ?? fallback);
}

const money = (value, fallback = 0) => {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : Number(fallback || 0);
};

function validatePaymentForBill({ paymentMethod, total, paidAmount, cashReceived }) {
  if (paidAmount < 0) {
    throw new ApiError(400, 'Amount paid cannot be negative');
  }
  if (paidAmount - total > 0.01) {
    throw new ApiError(400, 'Amount paid cannot exceed bill total');
  }
  if (paymentMethod === 'Cash' && cashReceived + 0.01 < paidAmount) {
    throw new ApiError(400, 'Cash received cannot be less than amount paid');
  }
  if (paymentMethod === 'Credit' && paidAmount - total > 0.01) {
    throw new ApiError(400, 'Amount paid cannot exceed bill total for credit sales');
  }
}

function changeReturnForPayment(paymentMethod, cashReceived, paidAmount) {
  return paymentMethod === 'Cash' ? Math.max(cashReceived - paidAmount, 0) : 0;
}

function clonePlain(value, fallback) {
  if (value === undefined || value === null) return fallback;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function normalizeHeldItemSnapshot(item = {}) {
  const quantity = money(item.quantity ?? item.qty, 0);
  const price = money(item.price ?? item.rate ?? item.sellingPrice, 0);
  const gstRate = money(item.gstRate ?? item.gst ?? item.taxRate ?? item.tax, 0);
  const discountPercent = money(item.discountPercent, 0);
  const discount = money(item.discount ?? item.discountAmount, 0);
  const gross = quantity * price;
  const taxableBase = Math.max(gross - discount, 0);
  const gstInclusive = Boolean(item.gstInclusive);
  const computedGst = gstInclusive && gstRate > 0
    ? taxableBase - taxableBase / (1 + gstRate / 100)
    : taxableBase * gstRate / 100;
  const gstAmount = money(item.gstAmount, computedGst);
  const taxableAmount = money(item.taxableAmount ?? item.amount, gstInclusive ? taxableBase - gstAmount : taxableBase);
  const netAmount = money(item.netAmount ?? item.lineTotal ?? item.total, gstInclusive ? taxableBase : taxableAmount + gstAmount);
  return {
    ...clonePlain(item, {}),
    productId: item.productId ?? item.mongoId ?? item._id ?? item.product,
    mongoId: String(item.mongoId || item._id || (mongoose.Types.ObjectId.isValid(String(item.productId || '')) ? item.productId : '') || ''),
    productIdNumber: item.productIdNumber ?? item.numericProductId ?? item.productIdValue,
    productName: item.productName || item.name || item.itemName || '',
    localName: item.localName || '',
    sku: item.sku || item.productCode || '',
    barcode: item.barcode || '',
    hsnCode: item.hsnCode || item.hsn || '',
    unit: item.unit || 'pcs',
    quantity,
    qty: quantity,
    freeQuantity: money(item.freeQuantity, 0),
    price,
    rate: money(item.rate, price),
    sellingPrice: money(item.sellingPrice, price),
    wholesalePrice: money(item.wholesalePrice, 0),
    mrp: money(item.mrp, 0),
    gst: gstRate,
    gstRate,
    gstAmount,
    taxableAmount,
    netAmount,
    lineTotal: money(item.lineTotal, netAmount),
    total: money(item.total, netAmount),
    discount,
    discountPercent,
    discountAmount: money(item.discountAmount, discount),
    gstInclusive,
    priceMode: item.priceMode || item.pricingMode || 'retail',
    stockAtSale: money(item.stockAtSale ?? item.stock, 0),
    batch: item.batch || '',
    expiry: item.expiry || '',
    remarks: item.remarks || '',
    metadata: item.metadata && typeof item.metadata === 'object' ? clonePlain(item.metadata, {}) : {}
  };
}

function buildHoldSnapshot(body, user) {
  const cart = clonePlain(body.cart, null) || clonePlain(body.items, []);
  const normalizedCart = Array.isArray(cart) ? cart.map(normalizeHeldItemSnapshot) : [];
  const normalizedPaymentMethod = normalizePaymentMethod(body.paymentMethod || body.payment?.method || body.payment?.paymentMethod || 'Cash');
  const total = money(body.total ?? body.totals?.total ?? body.totals?.billTotal ?? body.totals?.grandTotal, 0);
  const paidAmount = money(body.paidAmount ?? body.amountPaid ?? body.payment?.paidAmount ?? body.payment?.amountPaid, normalizedPaymentMethod === 'Credit' ? 0 : total);
  const balanceAmount = money(body.balanceAmount ?? body.balanceDue ?? body.payment?.balanceAmount ?? body.payment?.balanceDue, Math.max(total - paidAmount, 0));
  const paymentDetails = Array.isArray(body.paymentDetails)
    ? clonePlain(body.paymentDetails, [])
    : Array.isArray(body.payment?.paymentDetails)
      ? clonePlain(body.payment.paymentDetails, [])
      : normalizePaymentDetails(body, total, normalizedPaymentMethod);
  const invoice = {
    invoiceNo: body.invoiceNo || body.invoiceNumber || null,
    invoiceNumber: body.invoiceNumber || body.invoiceNo || null,
    invoiceAt: body.invoiceAt || null,
    mode: body.invoiceMode || body.mode || 'new',
    ...clonePlain(body.invoice, {})
  };
  const customer = {
    id: body.customerId || body.customer?._id || body.customer?.id || null,
    customerId: body.customerId || body.customer?.customerId || null,
    name: body.customerName || body.customer?.name || 'Walk-in Customer',
    mobile: body.customerMobile || body.customer?.mobile || '',
    phone: body.customerPhone || body.customer?.phone || body.customerMobile || '',
    address: body.customerAddress || body.customer?.address || '',
    city: body.customerCity || body.customer?.city || '',
    gstNumber: body.customerGST || body.customerGstNumber || body.customer?.gstNumber || '',
    panNumber: body.customerPAN || body.customerPanNumber || body.customer?.panNumber || '',
    creditLimit: money(body.customerCreditLimit ?? body.customer?.creditLimit, 0),
    openingBalance: money(body.customerOpeningBalance ?? body.customer?.openingBalance, 0),
    currentOutstanding: money(body.customerOutstanding ?? body.currentOutstanding ?? body.customer?.currentOutstanding ?? body.customer?.outstandingBalance, balanceAmount),
    remarks: body.customerRemarks || body.customer?.remarks || '',
    ...clonePlain(body.customer, {})
  };
  const totals = {
    subtotal: money(body.subtotal ?? body.totals?.subtotal, 0),
    taxTotal: money(body.taxTotal ?? body.totals?.taxTotal ?? body.totals?.gst, 0),
    gst: money(body.gst ?? body.taxTotal ?? body.totals?.gst, 0),
    cgst: money(body.cgst ?? body.totals?.cgst, 0),
    sgst: money(body.sgst ?? body.totals?.sgst, 0),
    igst: money(body.igst ?? body.totals?.igst, 0),
    discount: money(body.discount ?? body.totals?.discount, 0),
    discountPercent: money(body.discountPercent ?? body.totals?.discountPercent, 0),
    discountAmount: money(body.discountAmount ?? body.totals?.discountAmount, 0),
    roundOff: money(body.roundOff ?? body.totals?.roundOff, 0),
    total,
    billTotal: money(body.billTotal ?? body.totals?.billTotal, total),
    netTotal: money(body.netTotal ?? body.totals?.netTotal, total),
    totalQuantity: money(body.totalQuantity ?? body.totals?.totalQuantity, normalizedCart.reduce((sum, item) => sum + money(item.quantity, 0), 0)),
    totalItems: money(body.totalItems ?? body.totals?.totalItems, normalizedCart.length)
  };
  const payment = {
    method: normalizedPaymentMethod,
    paymentMethod: normalizedPaymentMethod,
    paymentDetails,
    cashReceived: money(body.cashReceived ?? body.payment?.cashReceived, 0),
    amountPaid: paidAmount,
    paidAmount,
    balance: balanceAmount,
    balanceAmount,
    balanceDue: balanceAmount,
    outstanding: money(body.outstanding ?? body.payment?.outstanding, balanceAmount),
    changeReturn: money(body.changeReturn ?? body.payment?.changeReturn, 0),
    creditAmount: money(body.creditAmount ?? body.payment?.creditAmount, normalizedPaymentMethod === 'Credit' ? balanceAmount : 0),
    partialPayment: Boolean(body.partialPayment ?? body.payment?.partialPayment ?? balanceAmount > 0),
    splitPayments: clonePlain(body.splitPayments, paymentDetails),
    ...clonePlain(body.payment, {})
  };
  return {
    invoice,
    customer,
    cart: normalizedCart,
    totals,
    payment,
    settings: clonePlain(body.settings, {}),
    uiState: {
      selectedIndex: body.selectedIndex ?? body.uiState?.selectedIndex ?? -1,
      editingCartIndex: body.editingCartIndex ?? body.uiState?.editingCartIndex ?? null,
      invoiceMode: body.invoiceMode || body.uiState?.invoiceMode || 'hold',
      ...clonePlain(body.uiState, {})
    },
    metadata: {
      source: 'pos-hold',
      heldAt: new Date().toISOString(),
      heldBy: user?._id,
      ...clonePlain(body.metadata, {})
    }
  };
}

function buildHoldDocumentPayload(snapshot, user) {
  const { cart, totals, payment, customer, invoice } = snapshot;
  const payload = {
    snapshot,
    invoice: snapshot.invoice,
    customer: snapshot.customer,
    cart: snapshot.cart,
    totals: snapshot.totals,
    payment: snapshot.payment,
    settings: snapshot.settings,
    uiState: snapshot.uiState,
    metadata: snapshot.metadata,
    items: cart,
    subtotal: totals.subtotal || 0,
    taxTotal: totals.taxTotal || 0,
    discount: totals.discount || 0,
    discountPercent: totals.discountPercent || 0,
    discountAmount: totals.discountAmount || 0,
    total: totals.total || 0,
    paymentMethod: payment.paymentMethod || payment.method || 'Cash',
    paymentDetails: payment.paymentDetails || [],
    cashReceived: payment.cashReceived || 0,
    changeReturn: payment.changeReturn || 0,
    paidAmount: payment.paidAmount || payment.amountPaid || 0,
    amountPaid: payment.amountPaid || payment.paidAmount || 0,
    balanceAmount: payment.balanceAmount || payment.balanceDue || 0,
    balanceDue: payment.balanceDue || payment.balanceAmount || 0,
    outstanding: payment.outstanding || payment.balanceAmount || 0,
    creditAmount: payment.creditAmount || 0,
    customerName: customer.name || 'Walk-in Customer',
    customerMobile: customer.mobile || null,
    invoiceNo: invoice.invoiceNo || invoice.invoiceNumber || null,
    heldBy: user?._id
  };

  if (invoice.invoiceAt) {
    const at = new Date(invoice.invoiceAt);
    if (!isNaN(at.getTime())) payload.invoiceAt = at;
  } else {
    payload.invoiceAt = undefined;
  }

  return payload;
}

function isWholeNumber(value) {
  return Math.abs(Number(value) - Math.round(Number(value))) < 0.0000001;
}

async function getUnitRule(unitName) {
  await ensureDefaultUnits();
  const name = String(unitName || 'pcs').trim().toLowerCase();
  const unit = await Unit.findOne({ name, active: true }).lean();
  return unit || { name: 'pcs', allowDecimal: false };
}

async function validateBillItemsForSale(items, stockCredits = []) {
  const settings = await Setting.findOne().lean();
  const allowNegativeStock = Boolean(settings?.allowNegativeStock);
  const creditsByProduct = new Map();
  for (const item of stockCredits || []) {
    const key = String(item.productId || item.product || item._id);
    creditsByProduct.set(key, (creditsByProduct.get(key) || 0) + Math.abs(Number(item.quantity || item.qty || 0)));
  }

  for (const it of items) {
    const product = await Product.findById(it.productId);
    if (!product) throw new ApiError(400, `Product not found: ${String(it.productId)}`);
    const unit = await getUnitRule(product.unit || it.unit);
    it.unit = unit.name;
    const quantity = Number(it.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new ApiError(400, `${product.name} quantity must be greater than zero`);
    }
    if (!Boolean(product.allowDecimalQty || unit.allowDecimal) && !isWholeNumber(quantity)) {
      throw new ApiError(400, `${product.name} must use whole number quantity for ${unit.name}`);
    }
    const available = Number(product.stock || 0) + (creditsByProduct.get(String(it.productId)) || 0);
    if (!allowNegativeStock && available + 0.0000001 < quantity) {
      throw new ApiError(400, 'Insufficient stock available.');
    }
  }
}

async function deductSoldStock(items, bill, userId) {
  const settings = await Setting.findOne().lean();
  const allowNegativeStock = Boolean(settings?.allowNegativeStock);
  for (const it of items) {
    const product = await Product.findOneAndUpdate(
      allowNegativeStock ? { _id: it.productId } : { _id: it.productId, stock: { $gte: it.quantity } },
      { $inc: { stock: -Math.abs(it.quantity) } },
      { new: false }
    );
    if (!product) throw new ApiError(400, 'Insufficient stock available.');
    const stockBefore = Number(product.stock || 0);
    const stockAfter = stockBefore - Math.abs(it.quantity);
    await InventoryLog.create({
      product: it.productId,
      type: 'stock_out',
      quantity: Math.abs(it.quantity),
      quantityOut: Math.abs(it.quantity),
      openingStock: stockBefore,
      closingStock: stockAfter,
      referenceType: 'Sale',
      referenceNumber: bill.invoiceNo,
      stockBefore,
      stockAfter,
      invoiceId: bill._id,
      referenceId: bill._id,
      reason: `Sale ${bill.invoiceNo}`,
      source: 'sale',
      user: userId
    });
  }
}

async function restoreSoldStock(items, reason, userId, billId) {
  for (const it of items || []) {
    const quantity = Math.abs(Number(it.quantity || it.qty || 0));
    if (!quantity) continue;
    const product = await Product.findById(it.productId);
    if (!product) continue;
    const stockBefore = Number(product.stock || 0);
    product.stock = stockBefore + quantity;
    await product.save();
    await InventoryLog.create({
      product: product._id,
      type: 'stock_in',
      quantity,
      quantityIn: quantity,
      openingStock: stockBefore,
      closingStock: product.stock,
      referenceType: 'Restore',
      referenceNumber: reason,
      stockBefore,
      stockAfter: product.stock,
      invoiceId: billId,
      referenceId: billId,
      reason,
      source: 'restore',
      user: userId
    });
  }
}

async function resolveBillCustomer({ customerId, customerMobile, customerName, customerAddress }) {
  if (customerId) return Customer.findById(customerId);
  const mobile = String(customerMobile || '').trim();
  if (!mobile) return null;

  const name = String(customerName || '').trim() || 'Walk-in Customer';
  let customer = await Customer.findOne({ mobile });
  if (!customer) {
    customer = await Customer.create({ name, mobile, address: customerAddress || '' });
  } else {
    if (name && name !== 'Walk-in Customer') customer.name = name;
    if (customerAddress) customer.address = customerAddress;
    await customer.save();
  }
  return customer;
}

async function recalculateCustomerBillingTotals(customerId) {
  if (!customerId) return;
  const customer = await Customer.findById(customerId);
  if (!customer) return;
  const bills = await Bill.find({ customer: customerId, status: { $ne: 'Cancelled' } }).lean();
  const creditBills = bills.filter((bill) => bill.paymentMethod === 'Credit');
  const paidAmount = bills.reduce((sum, bill) => sum + Number(bill.paidAmount || 0), 0);
  const creditPaid = creditBills.reduce((sum, bill) => sum + Number(bill.paidAmount || 0), 0);
  const dueAmount = creditBills.reduce((sum, bill) => sum + Number(bill.balanceAmount ?? 0), 0);

  customer.totalSpent = bills.reduce((sum, bill) => sum + Number(bill.total || 0), 0);
  customer.loyaltyPoints = Math.floor(customer.totalSpent / 100);
  customer.totalCredit = creditBills.reduce((sum, bill) => sum + Number(bill.total || 0), 0);
  customer.totalCreditSales = customer.totalCredit;
  customer.totalPaid = paidAmount;
  customer.totalPaidAmount = paidAmount;
  customer.outstandingBalance = dueAmount;
  customer.creditBalance = dueAmount;

  const billTransactions = creditBills.map((bill) => ({
    billId: bill._id,
    billModel: 'Bill',
    invoiceNo: bill.invoiceNo,
    billAmount: bill.total,
    paidAmount: bill.paidAmount,
    dueAmount: bill.dueAmount,
    paymentMethod: 'Credit',
    paymentStatus: bill.paymentStatus,
    date: bill.invoiceAt || bill.createdAt
  }));
  customer.creditTransactions = [
    ...customer.creditTransactions.filter((entry) => entry.billModel !== 'Bill'),
    ...billTransactions
  ];
  customer.creditHistory = [
    ...customer.creditHistory.filter((entry) => entry.billModel !== 'Bill'),
    ...billTransactions
  ];
  customer.lastCreditDate = creditBills.length ? new Date(Math.max(...creditBills.map((bill) => new Date(bill.invoiceAt || bill.createdAt).getTime()))) : undefined;
  customer.lastPaymentDate = creditPaid > 0 || paidAmount > 0
    ? new Date(Math.max(...bills.filter((bill) => Number(bill.paidAmount || 0) > 0).map((bill) => new Date(bill.invoiceAt || bill.createdAt).getTime())))
    : undefined;
  await customer.save();
}

// Create bill
export const createBill = asyncHandler(async (req, res) => {
  const { invoiceNo, items, subtotal, taxTotal, discount, discountPercent, discountAmount, roundOff, total, customerMobile, customerName, customerAddress, notes } = req.body;
  const paymentMethod = normalizePaymentMethod(req.body.paymentMethod);

  if (!items || items.length === 0) {
    throw new ApiError(400, 'Bill must have at least one item');
  }

  // Normalize and validate items - CRITICAL: Ensure productId is MongoDB ObjectId
  const normalizedItems = [];
  for (const it of items) {
    let pid = it.productId || it._id || null;

    // If pid is not a valid ObjectId, try to resolve it
    if (pid && !mongoose.Types.ObjectId.isValid(String(pid))) {
      const pidStr = String(pid);
      // Try numeric productId (handle number or numeric string)
      if (/^[0-9]+$/.test(pidStr)) {
        const prod = await Product.findOne({ productId: Number(pidStr), active: true }).lean();
        if (prod) {
          pid = prod._id;
        }
      } else if (it.productName) {
        const prod = await Product.findOne({ name: it.productName }).lean();
        if (prod) {
          pid = prod._id;
        }
      }
    }

    if (!pid || !mongoose.Types.ObjectId.isValid(String(pid))) {
      throw new ApiError(400, `Invalid product identifier for item: ${JSON.stringify(it)}. Expected MongoDB ObjectId, got: ${pid}`);
    }

    const productIdObj = new mongoose.Types.ObjectId(String(pid));

    const product = await Product.findById(productIdObj).lean();
    const normalized = normalizeBillItemSnapshot({
      ...it,
      productId: productIdObj,
      productIdNumber: it.productIdNumber ?? it.numericProductId ?? it.productIdValue,
      productName: it.productName || it.name || '',
      quantity: it.quantity ?? it.qty ?? 0,
      unit: it.unit || 'pcs',
      price: it.price || it.sellingPrice || it.rate || 0,
      gst: it.gst || it.taxRate || it.tax || 0,
      total: it.total != null ? it.total : (Number(it.price || it.sellingPrice || it.rate || 0) * parseFloat(it.quantity || it.qty || 0.001)),
      discount: it.discount || 0,
      sku: it.sku || it.code || '',
      barcode: it.barcode || '',
      localName: it.localName || '',
      purchasePrice: it.purchasePrice || '',
      wholesalePrice: it.wholesalePrice || '',
      mrp: it.mrp || '',
      hsnCode: it.hsnCode || it.hsn || '',
      category: it.category || '',
      companyName: it.companyName || '',
      stockAtSale: it.stockAtSale || product?.stock || 0,
      metadata: it.metadata || {}
    }, product);

    normalizedItems.push(normalized);
  }

  // Auto-generate invoice number if not provided
  const finalInvoiceNo = await generateUniqueInvoiceNo(invoiceNo || req.body.invoiceNumber);

  const billTotal = Number(total || 0);
  const paymentDetails = normalizePaymentDetails(req.body, billTotal, paymentMethod);
  const paidAmount = paymentDetails.length
    ? paymentDetails.reduce((sum, entry) => sum + Number(entry.amount || 0), 0)
    : paymentMethod === 'Credit'
      ? requestPaidAmount(req.body, 0)
      : requestPaidAmount(req.body, billTotal);
  const cashReceived = paymentMethod === 'Cash' ? money(req.body.cashReceived, paidAmount) : 0;

  validatePaymentForBill({ paymentMethod, total: billTotal, paidAmount, cashReceived });

  const dueAmount = Math.max(billTotal - paidAmount, 0);
  const paymentStatus = paymentStatusFromAmounts(billTotal, paidAmount);
  const customer = await resolveBillCustomer({
    customerId: req.body.customer,
    customerMobile,
    customerName,
    customerAddress
  });

  if (paymentMethod === 'Credit' && !customer) {
    throw new ApiError(400, 'Customer name and mobile number are required for credit bills');
  }

  const billPayload = {
    invoiceNo: finalInvoiceNo,
    customer: customer?._id,
    items: normalizedItems,
    subtotal: subtotal || 0,
    taxTotal: taxTotal || 0,
    discount: discount || 0,
    discountPercent: discountPercent || 0,
    discountAmount: discountAmount || 0,
    roundOff: money(roundOff, 0),
    total: billTotal,
    paidAmount,
    balanceAmount: dueAmount,
    dueAmount,
    paymentStatus,
    paymentMethod,
    paymentDetails,
    cashReceived,
    changeReturn: changeReturnForPayment(paymentMethod, cashReceived, paidAmount),
    customerMobile: customerMobile || null,
    customerName: customerName || 'Walk-in Customer',
    customerAddress: customerAddress || '',
    notes: notes || '',
    staff: req.user?._id
  };
  // honor editable invoice date/time if supplied
  if (req.body.invoiceAt) {
    const at = new Date(req.body.invoiceAt);
    if (!isNaN(at.getTime())) billPayload.invoiceAt = at;
  }

  console.log('Creating bill with normalized items:', {
    itemCount: normalizedItems.length,
    items: normalizedItems.map(it => ({
      productId: String(it.productId),
      productName: it.productName,
      quantity: it.quantity,
      price: it.price
    })),
    total: billPayload.total
  });

  await validateBillItemsForSale(normalizedItems);

  const bill = await Bill.create(billPayload);
  await deductSoldStock(normalizedItems, bill, req.user?._id);

  if (customer) {
    const loyaltyPoints = Math.floor(bill.total / 100);
    customer.totalSpent += bill.total;
    customer.loyaltyPoints += loyaltyPoints;

    if (paymentMethod === 'Credit') {
      const tx = {
        billId: bill._id,
        billModel: 'Bill',
        invoiceNo: bill.invoiceNo,
        billAmount: bill.total,
        paidAmount: bill.paidAmount,
        dueAmount: bill.dueAmount,
        paymentMethod: 'Credit',
        paymentStatus: bill.paymentStatus,
        date: bill.createdAt
      };
      customer.totalCredit += bill.total;
      customer.totalCreditSales += bill.total;
      customer.totalPaid += bill.paidAmount;
      customer.totalPaidAmount += bill.paidAmount;
      customer.outstandingBalance += bill.dueAmount;
      customer.creditBalance += bill.dueAmount;
      customer.lastCreditDate = bill.createdAt;
      if (bill.paidAmount > 0) customer.lastPaymentDate = bill.createdAt;
      customer.creditTransactions.push(tx);
      customer.creditHistory.push(tx);
    } else if (bill.paidAmount > 0) {
      customer.totalPaid += bill.paidAmount;
      customer.totalPaidAmount += bill.paidAmount;
      customer.lastPaymentDate = bill.createdAt;
    }

    await customer.save();
    await reconcileCustomerAccounting(customer._id);
  }
  await rebuildDayBook();

  await logAudit(req, { action: 'Bill Created', module: 'Billing', newValue: bill.toObject() });
  res.status(201).json({ bill, message: 'Bill created successfully' });
});

// Get bill by ID
export const getBill = asyncHandler(async (req, res) => {
  const bill = await Bill.findById(req.params.id).populate('items.productId');
  if (!bill) throw new ApiError(404, 'Bill not found');
  res.json({ bill });
});

// Update bill
export const updateBill = asyncHandler(async (req, res) => {
  const {
    items,
    subtotal,
    taxTotal,
    discount,
    roundOff,
    total,
    customerName,
    customerMobile,
    paymentMethod,
    amountPaid,
    discountPercent,
    discountAmount,
    notes,
    customerAddress
  } = req.body;

  const bill = await Bill.findById(req.params.id);
  if (!bill) throw new ApiError(404, 'Bill not found');
  const previous = bill.toObject();
  const previousCustomerId = bill.customer ? String(bill.customer) : null;

  if (!items || items.length === 0) {
    throw new ApiError(400, 'Bill must have at least one item');
  }

  const normalizedItems = [];
  for (const it of items) {
    let pid = it.productId || it._id || null;
    if (!pid || !mongoose.Types.ObjectId.isValid(String(pid))) {
      throw new ApiError(400, `Invalid product identifier for item: ${JSON.stringify(it)}`);
    }
    const productIdObj = new mongoose.Types.ObjectId(String(pid));
    const product = await Product.findById(productIdObj).lean();
    normalizedItems.push(normalizeBillItemSnapshot({
      ...it,
      productId: productIdObj,
      productIdNumber: it.productIdNumber ?? it.numericProductId ?? it.productIdValue,
      productName: it.productName || it.name || '',
      quantity: it.quantity ?? it.qty ?? 0,
      unit: it.unit || 'pcs',
      price: it.price || it.sellingPrice || it.rate || 0,
      gst: it.gst || it.taxRate || it.tax || 0,
      total: it.total != null ? it.total : (Number(it.price || it.sellingPrice || it.rate || 0) * parseFloat(it.quantity || it.qty || 0.001)),
      discount: it.discount || 0,
      sku: it.sku || it.code || '',
      barcode: it.barcode || '',
      localName: it.localName || '',
      purchasePrice: it.purchasePrice || '',
      wholesalePrice: it.wholesalePrice || '',
      mrp: it.mrp || '',
      hsnCode: it.hsnCode || it.hsn || '',
      category: it.category || '',
      companyName: it.companyName || '',
      stockAtSale: it.stockAtSale || product?.stock || 0,
      metadata: it.metadata || {}
    }, product));
  }

  const customer = await resolveBillCustomer({
    customerId: req.body.customer,
    customerMobile,
    customerName,
    customerAddress
  });
  const normalizedPaymentMethod = normalizePaymentMethod(paymentMethod || bill.paymentMethod);
  if (normalizedPaymentMethod === 'Credit' && !customer) {
    throw new ApiError(400, 'Customer name and mobile number are required for credit bills');
  }

  await validateBillItemsForSale(normalizedItems, bill.items);
  await restoreSoldStock(bill.items, `Bill edit restore ${bill.invoiceNo}`, req.user?._id, bill._id);
  try {
    await deductSoldStock(normalizedItems, bill, req.user?._id);
  } catch (error) {
    await deductSoldStock(bill.items, bill, req.user?._id);
    throw error;
  }

  bill.items = normalizedItems;
  bill.subtotal = subtotal != null ? subtotal : bill.subtotal;
  bill.taxTotal = taxTotal != null ? taxTotal : bill.taxTotal;
  bill.discount = discount != null ? discount : bill.discount;
  bill.discountPercent = discountPercent != null ? discountPercent : bill.discountPercent;
  bill.discountAmount = discountAmount != null ? discountAmount : bill.discountAmount;
  bill.roundOff = roundOff != null ? roundOff : bill.roundOff;
  bill.total = total != null ? total : bill.subtotal + bill.taxTotal - bill.discount + bill.roundOff;
  bill.customer = customer?._id || undefined;
  bill.customerName = customerName || 'Walk-in Customer';
  bill.customerMobile = customerMobile || undefined;
  bill.customerAddress = customerAddress || customer?.address || '';
  bill.paymentMethod = normalizedPaymentMethod;
  bill.paymentDetails = normalizePaymentDetails(req.body, bill.total, bill.paymentMethod);
  bill.paidAmount = bill.paymentDetails.length
    ? bill.paymentDetails.reduce((sum, entry) => sum + Number(entry.amount || 0), 0)
    : requestPaidAmount(req.body, bill.paymentMethod === 'Credit' ? bill.paidAmount ?? 0 : bill.total);
  bill.cashReceived = bill.paymentMethod === 'Cash' ? money(req.body.cashReceived, bill.paidAmount) : 0;
  validatePaymentForBill({
    paymentMethod: bill.paymentMethod,
    total: bill.total,
    paidAmount: bill.paidAmount,
    cashReceived: bill.cashReceived
  });
  bill.changeReturn = changeReturnForPayment(bill.paymentMethod, bill.cashReceived, bill.paidAmount);
  const balanceAmount = Math.max(bill.total - bill.paidAmount - Number(bill.returnCreditAmount || 0), 0);
  bill.dueAmount = balanceAmount;
  bill.balanceAmount = balanceAmount;
  bill.paymentStatus = paymentStatusFromAmounts(bill.total, bill.paidAmount);
  bill.notes = notes != null ? notes : bill.notes;
  await bill.save();
  await recalculateCustomerBillingTotals(previousCustomerId);
  if (customer?._id && String(customer._id) !== previousCustomerId) {
    await recalculateCustomerBillingTotals(customer._id);
  }
  await reconcileCustomerAccounting(previousCustomerId);
  if (customer?._id && String(customer._id) !== previousCustomerId) await reconcileCustomerAccounting(customer._id);
  await rebuildDayBook();
  await logAudit(req, { action: 'Bill Edited', module: 'Billing', previousValue: previous, newValue: bill.toObject() });
  res.json({ bill, message: 'Bill updated successfully' });
});

// Delete bill (soft delete)
export const deleteBill = asyncHandler(async (req, res) => {
  const reason = String(req.body.reason || '').trim();
  if (!reason) throw new ApiError(400, 'Cancellation reason is required');
  const bill = await Bill.findById(req.params.id);

  if (!bill) throw new ApiError(404, 'Bill not found');
  if (bill.status === 'Cancelled') return res.json({ bill, message: 'Bill already cancelled' });
  const previous = bill.toObject();
  const customerId = bill.customer;

  await DeletedBill.create({
    invoiceNo: bill.invoiceNo,
    deletedBy: req.user?._id,
    reason,
    originalData: bill.toObject(),
  });
  await restoreSoldStock(bill.items, `Deleted bill restore ${bill.invoiceNo}`, req.user?._id, bill._id);

  bill.status = 'Cancelled';
  bill.cancelledAt = new Date();
  bill.cancelledBy = req.user?._id;
  bill.cancellationReason = reason;
  bill.paymentStatus = 'Unpaid';
  bill.paidAmount = 0;
  bill.balanceAmount = 0;
  bill.dueAmount = 0;
  await bill.save();
  await recalculateCustomerBillingTotals(customerId);
  await reconcileCustomerAccounting(customerId);
  await rebuildDayBook();
  await logAudit(req, { action: 'Bill Cancelled', module: 'Billing', previousValue: previous, newValue: { invoiceNo: bill.invoiceNo, reason } });

  res.json({ bill, message: 'Bill cancelled successfully' });
});

export const getDeletedBills = asyncHandler(async (req, res) => {
  const deletedBills = await DeletedBill.find()
    .populate('deletedBy', 'name email')
    .sort({ createdAt: -1 });
  res.json({ deletedBills });
});

export const restoreDeletedBill = asyncHandler(async (req, res) => {
  const deletedBill = await DeletedBill.findById(req.params.id).lean();
  if (!deletedBill) throw new ApiError(404, 'Deleted bill not found');

  const existingBill = await Bill.findOne({ invoiceNo: deletedBill.originalData.invoiceNo }).lean();
  if (existingBill) {
    throw new ApiError(409, 'Invoice number already exists in active bills');
  }

  const originalItems = (deletedBill.originalData.items || []).map((item) =>
    normalizeBillItemSnapshot(item)
  );

  await validateBillItemsForSale(originalItems);
  await deductSoldStock(originalItems, { _id: deletedBill._id, invoiceNo: deletedBill.originalData.invoiceNo }, req.user?._id);

  const restoredBillData = {
    ...deletedBill.originalData,
    _id: undefined,
    invoiceNo: deletedBill.originalData.invoiceNo,
    invoiceNumber: deletedBill.originalData.invoiceNumber || deletedBill.originalData.invoiceNo,
    items: originalItems,
    status: 'Completed',
    paidAmount: Number(deletedBill.originalData.paidAmount ?? deletedBill.originalData.total ?? 0),
    dueAmount: Math.max(Number(deletedBill.originalData.dueAmount || 0), 0),
    balanceAmount: Number(deletedBill.originalData.balanceAmount || 0),
    paymentStatus: deletedBill.originalData.paymentStatus || paymentStatusFromAmounts(Number(deletedBill.originalData.total || 0), Number(deletedBill.originalData.paidAmount || deletedBill.originalData.total || 0)),
    createdAt: deletedBill.originalData.createdAt,
    updatedAt: new Date()
  };

  const bill = await Bill.create(restoredBillData);
  await reconcileCustomerAccounting(bill.customer);
  await rebuildDayBook();
  await DeletedBill.findByIdAndDelete(req.params.id);

  res.json({ bill, message: 'Deleted bill restored' });
});

export const permanentlyDeleteDeletedBill = asyncHandler(async (req, res) => {
  const bill = await DeletedBill.findByIdAndDelete(req.params.id);
  if (!bill) throw new ApiError(404, 'Deleted bill not found');
  res.json({ message: 'Deleted bill permanently removed' });
});

// Get all bills with filters
export const getBills = asyncHandler(async (req, res) => {
  const { startDate, endDate, paymentMethod, customerMobile, page = 1, limit = 50 } = req.query;
  const query = {};

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  if (paymentMethod) query.paymentMethod = paymentMethod;
  if (customerMobile) query.customerMobile = customerMobile;

  const skip = (page - 1) * limit;
  const bills = await Bill.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Bill.countDocuments(query);

  res.json({
    bills,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

// Search bills
export const searchBills = asyncHandler(async (req, res) => {
  const { q } = req.query;
  if (!q) throw new ApiError(400, 'Search query required');

  const bills = await Bill.find({
    $or: [
      { invoiceNo: { $regex: q, $options: 'i' } },
      { customerMobile: { $regex: q, $options: 'i' } },
      { customerName: { $regex: q, $options: 'i' } },
    ],
  })
    .sort({ createdAt: -1 })
    .limit(10);

  res.json({ bills });
});

// Get today's sales stats
export const getTodaysSales = asyncHandler(async (req, res) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const bills = await Bill.find({
    createdAt: { $gte: startOfDay, $lte: endOfDay },
  });

  const stats = {
    totalSales: bills.reduce((sum, b) => sum + b.total, 0),
    totalBills: bills.length,
    totalItems: bills.reduce((sum, b) => sum + (b.items || []).length, 0),
    totalTax: bills.reduce((sum, b) => sum + b.taxTotal, 0),
    totalDiscount: bills.reduce((sum, b) => sum + b.discount, 0),
    paymentBreakdown: {},
  };

  bills.forEach((bill) => {
    stats.paymentBreakdown[bill.paymentMethod] =
      (stats.paymentBreakdown[bill.paymentMethod] || 0) + bill.total;
  });

  res.json(stats);
});

// Hold bill
export const holdBill = asyncHandler(async (req, res) => {
  const snapshot = buildHoldSnapshot(req.body, req.user);
  const { cart } = snapshot;

  if (!cart || cart.length === 0) {
    throw new ApiError(400, 'Held bill must contain at least one item');
  }

  const payload = buildHoldDocumentPayload(snapshot, req.user);

  const heldBill = await HoldBill.create(payload);

  res.status(201).json({ heldBill, message: 'Bill held successfully' });
});

// Update held bill
export const updateHeldBill = asyncHandler(async (req, res) => {
  const existing = await HoldBill.findById(req.params.id);
  if (!existing) throw new ApiError(404, 'Held bill not found');

  const snapshot = buildHoldSnapshot(req.body, req.user);
  if (!snapshot.cart || snapshot.cart.length === 0) {
    throw new ApiError(400, 'Held bill must contain at least one item');
  }

  const payload = buildHoldDocumentPayload(snapshot, req.user);
  Object.assign(existing, payload);
  await existing.save();

  res.json({ heldBill: existing, message: 'Hold Bill Updated Successfully' });
});

// Get held bills
export const getHeldBills = asyncHandler(async (req, res) => {
  const filter = {};
  const search = String(req.query.search || req.query.q || '').trim();
  if (search) {
    const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ customerName: regex }, { customerMobile: regex }, { invoiceNo: regex }, { 'items.productName': regex }];
  }
  const heldBills = await HoldBill.find(filter)
    .sort({ createdAt: -1 });
  res.json({ heldBills });
});

// Resume held bill
export const resumeHeldBill = asyncHandler(async (req, res) => {
  const heldBill = await HoldBill.findById(req.params.id).lean();
  if (!heldBill) throw new ApiError(404, 'Held bill not found');

  const snapshot = heldBill.snapshot && Object.keys(heldBill.snapshot).length
    ? heldBill.snapshot
    : {
      invoice: heldBill.invoice || { invoiceNo: heldBill.invoiceNo, invoiceAt: heldBill.invoiceAt },
      customer: heldBill.customer || { name: heldBill.customerName, mobile: heldBill.customerMobile },
      cart: heldBill.cart?.length ? heldBill.cart : heldBill.items || [],
      totals: heldBill.totals || {
        subtotal: heldBill.subtotal,
        taxTotal: heldBill.taxTotal,
        discount: heldBill.discount,
        discountPercent: heldBill.discountPercent,
        discountAmount: heldBill.discountAmount,
        total: heldBill.total
      },
      payment: heldBill.payment || {
        paymentMethod: heldBill.paymentMethod,
        paymentDetails: heldBill.paymentDetails,
        cashReceived: heldBill.cashReceived,
        changeReturn: heldBill.changeReturn,
        paidAmount: heldBill.paidAmount,
        amountPaid: heldBill.amountPaid,
        balanceAmount: heldBill.balanceAmount,
        balanceDue: heldBill.balanceDue,
        outstanding: heldBill.outstanding,
        creditAmount: heldBill.creditAmount
      },
      settings: heldBill.settings || {},
      uiState: heldBill.uiState || {},
      metadata: heldBill.metadata || {}
    };

  // Return both the historical heldBill shape and the authoritative POS snapshot.
  res.json({ heldBill: { ...heldBill, snapshot }, snapshot });
});

// Delete held bill
export const deleteHeldBill = asyncHandler(async (req, res) => {
  const result = await HoldBill.findByIdAndDelete(req.params.id);
  if (!result) throw new ApiError(404, 'Held bill not found');
  await logAudit(req, { action: 'Hold Bill Deleted', module: 'Billing', previousValue: result.toObject() });
  res.json({ message: 'Held bill discarded' });
});

// Create refund
export const createRefund = asyncHandler(async (req, res) => {
  const { bill, items, type, reason } = req.body;

  const refund = await Refund.create({
    bill,
    items,
    type,
    reason,
    processedBy: req.user?._id,
  });

  // Restore stock for refunded items
  for (const it of items || []) {
    try {
      const pid = it.productId || it._id || it.product;
      if (pid && mongoose.Types.ObjectId.isValid(String(pid))) {
        await Product.updateOne({ _id: pid }, { $inc: { stock: Math.abs(it.quantity || it.qty || 0) } });
      }
    } catch (e) {
      console.warn('Failed to restore stock for refund item', it, e);
    }
  }

  res.status(201).json({ refund, message: 'Refund created successfully' });
});

// Get refunds
export const getRefunds = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50 } = req.query;
  const skip = (page - 1) * limit;

  const refunds = await Refund.find()
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Refund.countDocuments();

  res.json({
    refunds,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

// Log print
export const logPrint = asyncHandler(async (req, res) => {
  const { invoiceNo, printer, success, error, paperWidth, duplicateCopy } = req.body;

  const printLog = await PrintLog.create({
    invoiceNo,
    printer,
    paperWidth,
    duplicateCopy: Boolean(duplicateCopy),
    printedBy: req.user?._id,
    success,
    error,
  });

  await logAudit(req, { action: duplicateCopy ? 'Bill Reprinted' : 'Bill Printed', module: 'Billing', newValue: { invoiceNo, printer, paperWidth, success, error } });
  res.status(201).json({ printLog });
});
