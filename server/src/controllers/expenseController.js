import multer from 'multer';
import fs from 'fs/promises';
import path from 'path';
import PDFDocument from 'pdfkit';
import { body } from 'express-validator';
import { env } from '../config/env.js';
import { Expense } from '../models/Expense.js';
import { ExpenseCategory } from '../models/ExpenseCategory.js';
import { ExpenseLedger } from '../models/ExpenseLedger.js';
import { Setting } from '../models/Setting.js';
import { Supplier } from '../models/Supplier.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { logAudit } from '../utils/audit.js';
import { rebuildDayBook } from '../services/accountingService.js';

const methods = ['Cash', 'UPI', 'Card', 'Bank', 'Cheque', 'Wallet'];
const number = (value) => Number(value || 0);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const dateRange = (from, to) => {
  const range = {};
  if (from) range.$gte = new Date(from);
  if (to) { const end = new Date(to); end.setHours(23, 59, 59, 999); range.$lte = end; }
  return Object.keys(range).length ? range : null;
};
const postedStatuses = ['Posted'];
const approvalStatuses = ['Draft', 'Pending Approval', 'Approved', 'Rejected', 'Posted', 'Cancelled'];

export const expenseUpload = multer({
  storage: multer.diskStorage({
    destination: env.uploadDir,
    filename: (req, file, cb) => cb(null, `expense-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`)
  }),
  limits: { fileSize: Number(process.env.EXPENSE_ATTACHMENT_HARD_MAX_BYTES || 100 * 1024 * 1024) },
  fileFilter: (req, file, cb) => {
    if (!['application/pdf', 'image/png', 'image/jpeg'].includes(file.mimetype)) return cb(new Error('Only PDF, PNG, JPG and JPEG files are allowed'));
    cb(null, true);
  }
});

export const categoryRules = [
  body('name').trim().notEmpty().withMessage('Category name is required'),
  body('code').trim().notEmpty().withMessage('Category code is required'),
  body('description').optional().trim(),
  body('active').optional().isBoolean()
];

function normalizeMethod(value) {
  const text = String(value || '').trim().toLowerCase();
  if (text === 'cash') return 'Cash';
  if (text === 'upi') return 'UPI';
  if (text === 'card') return 'Card';
  if (text === 'bank' || text === 'bank transfer') return 'Bank';
  if (text === 'cheque' || text === 'check') return 'Cheque';
  if (text === 'wallet') return 'Wallet';
  return '';
}

async function nextExpenseNo(requested) {
  if (requested) {
    const exists = await Expense.exists({ expenseNo: requested });
    if (exists) throw new ApiError(409, 'Expense number already exists');
    return requested;
  }
  let settings = await Setting.findOne();
  if (!settings) settings = await Setting.create({});
  const prefix = String(settings?.expenseNumberPrefix || 'EXP').trim() || 'EXP';
  const start = Number(settings?.expenseNumberNext || 1);
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = `${prefix}${String(start + attempt).padStart(6, '0')}`;
    const exists = await Expense.exists({ expenseNo: candidate });
    if (!exists) {
      settings.expenseNumberNext = start + attempt + 1;
      await settings.save();
      return candidate;
    }
  }
  throw new ApiError(409, 'Unable to generate expense number');
}

async function validateExpensePayload(body, existingId = null) {
  const expenseDate = new Date(body.expenseDate || body.date || new Date());
  if (Number.isNaN(expenseDate.getTime())) throw new ApiError(400, 'Invalid expense date');
  const settings = await Setting.findOne().lean();
  if (!settings?.allowFutureExpenses && expenseDate > new Date()) throw new ApiError(400, 'Future expense date is not allowed');
  const category = await ExpenseCategory.findById(body.category || body.categoryId);
  if (!category || category.active === false) throw new ApiError(400, 'Valid expense category is required');
  const amount = number(body.amount);
  const gstAmount = number(body.gstAmount);
  const gstInclusive = ['true', true, '1', 1, 'inclusive'].includes(body.gstInclusive) || String(body.gstMode || '').toLowerCase() === 'inclusive';
  if (amount <= 0) throw new ApiError(400, 'Expense amount must be greater than zero');
  if (gstAmount < 0) throw new ApiError(400, 'GST amount cannot be negative');
  if (gstAmount > amount && gstInclusive) throw new ApiError(400, 'GST amount cannot exceed inclusive amount');
  const paymentMethod = normalizeMethod(body.paymentMethod);
  if (!methods.includes(paymentMethod)) throw new ApiError(400, 'Invalid payment method');
  if (body.expenseNo) {
    const duplicate = await Expense.findOne({ expenseNo: body.expenseNo, ...(existingId ? { _id: { $ne: existingId } } : {}) }).lean();
    if (duplicate) throw new ApiError(409, 'Expense number already exists');
  }
  let supplier = null;
  if (body.supplier || body.supplierId) {
    supplier = await Supplier.findById(body.supplier || body.supplierId).lean();
    if (!supplier) throw new ApiError(400, 'Selected supplier was not found');
  }
  const taxableAmount = gstInclusive ? Math.max(amount - gstAmount, 0) : amount;
  const totalAmount = gstInclusive ? amount : amount + gstAmount;
  return { category, expenseDate, amount, gstAmount, taxableAmount, totalAmount, paymentMethod, gstInclusive, supplier };
}

async function rebuildExpenseLedger() {
  const expenses = await Expense.find({ status: { $in: postedStatuses } }).sort({ expenseDate: 1, _id: 1 }).lean();
  let balance = 0;
  const entries = expenses.map((expense) => {
    balance += number(expense.totalAmount);
    return {
      expense: expense._id,
      category: expense.category,
      voucherNo: expense.expenseNo,
      expenseName: expense.expenseName,
      debit: expense.totalAmount,
      credit: 0,
      balance,
      paymentMethod: expense.paymentMethod,
      remarks: expense.remarks || expense.description || '',
      transactionDate: expense.expenseDate,
      createdBy: expense.createdBy,
      sourceKey: `Expense:${expense._id}`
    };
  });
  if (entries.length) {
    await ExpenseLedger.bulkWrite(entries.map((entry) => ({ updateOne: { filter: { sourceKey: entry.sourceKey }, update: { $set: entry }, upsert: true } })));
    await ExpenseLedger.deleteMany({ sourceKey: { $nin: entries.map((entry) => entry.sourceKey) } });
  } else {
    await ExpenseLedger.deleteMany({});
  }
}

function attachmentFromFile(file) {
  if (!file) return undefined;
  return {
    filename: file.filename,
    originalName: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
    path: file.path,
    url: `/uploads/${file.filename}`
  };
}

async function deleteAttachmentFile(attachment) {
  if (!attachment?.path) return;
  const resolved = path.resolve(attachment.path);
  const uploadRoot = path.resolve(env.uploadDir);
  if (!resolved.startsWith(uploadRoot)) return;
  await fs.unlink(resolved).catch((error) => {
    if (error.code !== 'ENOENT') console.warn('Unable to delete expense attachment', error.message);
  });
}

async function validateUploadedAttachment(file) {
  if (!file) return;
  const settings = await Setting.findOne().lean();
  const maxBytes = Number(settings?.expenseAttachmentMaxBytes || process.env.EXPENSE_ATTACHMENT_MAX_BYTES || 5 * 1024 * 1024);
  if (file.size > maxBytes) {
    await deleteAttachmentFile({ path: file.path });
    throw new ApiError(400, `Attachment exceeds maximum size of ${Math.round(maxBytes / 1024 / 1024)} MB`);
  }
}

function supplierSnapshot(supplier) {
  if (!supplier) return undefined;
  return {
    name: supplier.name,
    mobile: supplier.mobile,
    email: supplier.email,
    gstNumber: supplier.gstNumber,
    address: [supplier.address, supplier.city, supplier.state, supplier.pincode].filter(Boolean).join(', ')
  };
}

function requestedStatus(body, settings) {
  const incoming = approvalStatuses.includes(body.status) ? body.status : '';
  if (incoming === 'Draft') return 'Draft';
  if (settings?.expenseApprovalRequired) {
    if (incoming === 'Approved' || incoming === 'Posted') return 'Pending Approval';
    return incoming || 'Pending Approval';
  }
  return incoming && incoming !== 'Pending Approval' && incoming !== 'Rejected' ? incoming : 'Posted';
}

function voucherAuditEntry(req, expense, action) {
  return {
    action,
    user: req.user?._id,
    userName: req.user?.name || req.user?.email,
    voucherNo: expense.expenseNo,
    at: new Date()
  };
}

async function recordVoucherAudit(req, expense, action) {
  expense.voucherAudit.push(voucherAuditEntry(req, expense, action));
  if (action === 'Printed' || action === 'Reprinted') expense.reprintCount += 1;
  await expense.save();
  await logAudit(req, { action: `Expense Voucher ${action}`, module: 'Expenses', newValue: { expenseNo: expense.expenseNo, action } });
}

export const seedExpenseCategories = asyncHandler(async (req, res) => {
  const examples = ['Electricity', 'Rent', 'Salary', 'Transport', 'Fuel', 'Internet', 'Maintenance', 'Office Supplies', 'Cleaning', 'Marketing', 'Packing', 'Miscellaneous'];
  for (const name of examples) {
    await ExpenseCategory.updateOne(
      { name: new RegExp(`^${name}$`, 'i') },
      { $setOnInsert: { name, code: name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 20), description: '', active: true } },
      { upsert: true }
    );
  }
  res.json({ message: 'Default expense categories ready' });
});

export const listExpenseCategories = asyncHandler(async (req, res) => {
  const search = String(req.query.search || '').trim();
  const active = req.query.status === 'inactive' ? false : req.query.status === 'all' ? undefined : true;
  const filter = { ...(active === undefined ? {} : { active }), ...(search ? { $or: [{ name: new RegExp(search, 'i') }, { code: new RegExp(search, 'i') }] } : {}) };
  const categories = await ExpenseCategory.find(filter).sort({ name: 1 });
  res.json({ categories });
});

export const createExpenseCategory = asyncHandler(async (req, res) => {
  const category = await ExpenseCategory.create({ ...req.body, code: String(req.body.code || '').toUpperCase() });
  await logAudit(req, { action: 'Expense Category Created', module: 'Expenses', newValue: category.toObject() });
  res.status(201).json({ category });
});

export const updateExpenseCategory = asyncHandler(async (req, res) => {
  const previous = await ExpenseCategory.findById(req.params.id).lean();
  const category = await ExpenseCategory.findByIdAndUpdate(req.params.id, { ...req.body, code: String(req.body.code || '').toUpperCase() }, { new: true, runValidators: true });
  if (!category) throw new ApiError(404, 'Expense category not found');
  await logAudit(req, { action: 'Expense Category Edited', module: 'Expenses', previousValue: previous, newValue: category.toObject() });
  res.json({ category });
});

export const deleteExpenseCategory = asyncHandler(async (req, res) => {
  const inUse = await Expense.exists({ category: req.params.id, status: { $ne: 'Deleted' } });
  if (inUse) throw new ApiError(400, 'Category is used by expenses and cannot be deleted');
  const category = await ExpenseCategory.findByIdAndUpdate(req.params.id, { active: false, deletedAt: new Date(), deletedBy: req.user._id }, { new: true });
  if (!category) throw new ApiError(404, 'Expense category not found');
  await logAudit(req, { action: 'Expense Category Deleted', module: 'Expenses', previousValue: category.toObject() });
  res.json({ category, message: 'Category deleted' });
});

export const listExpenses = asyncHandler(async (req, res) => {
  const range = dateRange(req.query.from, req.query.to);
  const search = String(req.query.search || '').trim();
  const query = {
    ...(req.query.includeDeleted === 'true' ? {} : { status: { $ne: 'Deleted' } }),
    ...(range ? { expenseDate: range } : {}),
    ...(req.query.category ? { category: req.query.category } : {}),
    ...(req.query.vendor ? { vendor: new RegExp(req.query.vendor, 'i') } : {}),
    ...(req.query.supplier ? { supplier: req.query.supplier } : {}),
    ...(req.query.user ? { createdBy: req.query.user } : {}),
    ...(req.query.paymentMethod ? { paymentMethod: normalizeMethod(req.query.paymentMethod) } : {}),
    ...(req.query.status ? { status: req.query.status } : {}),
    ...(search ? {
      $or: [
        { expenseNo: new RegExp(search, 'i') },
        { expenseName: new RegExp(search, 'i') },
        { vendor: new RegExp(search, 'i') },
        { paymentMethod: new RegExp(search, 'i') },
        { referenceNumber: new RegExp(search, 'i') },
        { remarks: new RegExp(search, 'i') }
      ]
    } : {})
  };
  const expenses = await Expense.find(query).populate('category', 'name code').populate('supplier', 'name mobile email gstNumber address city state pincode').populate('createdBy preparedBy approvedBy', 'name email').sort({ expenseDate: -1, createdAt: -1 }).limit(Number(req.query.limit || 500));
  res.json({ expenses });
});

export const createExpense = asyncHandler(async (req, res) => {
  await validateUploadedAttachment(req.file);
  const normalized = await validateExpensePayload(req.body);
  const expenseNo = await nextExpenseNo(req.body.expenseNo);
  const settings = await Setting.findOne().lean();
  const status = requestedStatus(req.body, settings);
  const expense = await Expense.create({
    expenseNo,
    expenseDate: normalized.expenseDate,
    category: normalized.category._id,
    categoryName: normalized.category.name,
    expenseName: req.body.expenseName || req.body.name,
    description: req.body.description || '',
    amount: normalized.amount,
    gstAmount: normalized.gstAmount,
    taxableAmount: normalized.taxableAmount,
    totalAmount: normalized.totalAmount,
    gstInclusive: normalized.gstInclusive,
    gstExclusive: !normalized.gstInclusive,
    paymentMethod: normalized.paymentMethod,
    referenceNumber: req.body.referenceNumber || '',
    vendor: req.body.vendor || normalized.supplier?.name || '',
    supplier: normalized.supplier?._id,
    supplierSnapshot: supplierSnapshot(normalized.supplier),
    attachment: attachmentFromFile(req.file),
    remarks: req.body.remarks || '',
    status,
    approvalStatus: status,
    preparedBy: req.body.preparedBy || req.user._id,
    createdBy: req.user._id,
    approvedBy: status === 'Posted' || status === 'Approved' ? (req.body.approvedBy || req.user._id) : undefined,
    approvalDate: status === 'Posted' || status === 'Approved' ? new Date() : undefined
  });
  if (status === 'Posted') {
    await rebuildExpenseLedger();
    await rebuildDayBook();
  }
  await logAudit(req, { action: 'Expense Created', module: 'Expenses', newValue: expense.toObject() });
  res.status(201).json({ expense });
});

export const updateExpense = asyncHandler(async (req, res) => {
  await validateUploadedAttachment(req.file);
  const expense = await Expense.findById(req.params.id);
  if (!expense) throw new ApiError(404, 'Expense not found');
  if (expense.status === 'Cancelled' || expense.status === 'Deleted') throw new ApiError(400, 'Cancelled or deleted expense cannot be edited');
  const previous = expense.toObject();
  const normalized = await validateExpensePayload(req.body, expense._id);
  const settings = await Setting.findOne().lean();
  const nextStatus = requestedStatus(req.body, settings);
  expense.expenseDate = normalized.expenseDate;
  expense.category = normalized.category._id;
  expense.categoryName = normalized.category.name;
  expense.expenseName = req.body.expenseName || req.body.name || expense.expenseName;
  expense.description = req.body.description || '';
  expense.amount = normalized.amount;
  expense.gstAmount = normalized.gstAmount;
  expense.taxableAmount = normalized.taxableAmount;
  expense.totalAmount = normalized.totalAmount;
  expense.gstInclusive = normalized.gstInclusive;
  expense.gstExclusive = !normalized.gstInclusive;
  expense.paymentMethod = normalized.paymentMethod;
  expense.referenceNumber = req.body.referenceNumber || '';
  expense.vendor = req.body.vendor || normalized.supplier?.name || '';
  expense.supplier = normalized.supplier?._id;
  expense.supplierSnapshot = supplierSnapshot(normalized.supplier);
  expense.remarks = req.body.remarks || '';
  expense.status = nextStatus;
  expense.approvalStatus = nextStatus;
  expense.preparedBy = req.body.preparedBy || expense.preparedBy || req.user._id;
  if (req.file) {
    await deleteAttachmentFile(expense.attachment);
    expense.attachment = attachmentFromFile(req.file);
  }
  await expense.save();
  await rebuildExpenseLedger();
  await rebuildDayBook();
  await logAudit(req, { action: 'Expense Edited', module: 'Expenses', previousValue: previous, newValue: expense.toObject() });
  res.json({ expense });
});

export const cancelExpense = asyncHandler(async (req, res) => {
  const reason = String(req.body.reason || '').trim();
  if (!reason) throw new ApiError(400, 'Cancellation reason is required');
  const expense = await Expense.findById(req.params.id);
  if (!expense) throw new ApiError(404, 'Expense not found');
  if (expense.status === 'Cancelled') return res.json({ expense, message: 'Expense already cancelled' });
  const previous = expense.toObject();
  expense.status = 'Cancelled';
  expense.approvalStatus = 'Cancelled';
  expense.cancelledAt = new Date();
  expense.cancelledBy = req.user._id;
  expense.cancellationReason = reason;
  await expense.save();
  await rebuildExpenseLedger();
  await rebuildDayBook();
  await logAudit(req, { action: 'Expense Cancelled', module: 'Expenses', previousValue: previous, newValue: expense.toObject() });
  res.json({ expense, message: 'Expense cancelled' });
});

export const deleteExpense = asyncHandler(async (req, res) => {
  const expense = await Expense.findById(req.params.id);
  if (!expense) throw new ApiError(404, 'Expense not found');
  const previous = expense.toObject();
  expense.status = 'Deleted';
  expense.deletedAt = new Date();
  expense.deletedBy = req.user._id;
  await expense.save();
  await rebuildExpenseLedger();
  await rebuildDayBook();
  await logAudit(req, { action: 'Expense Deleted', module: 'Expenses', previousValue: previous, newValue: expense.toObject() });
  res.json({ expense, message: 'Expense deleted' });
});

export const restoreExpense = asyncHandler(async (req, res) => {
  const expense = await Expense.findById(req.params.id);
  if (!expense) throw new ApiError(404, 'Expense not found');
  const previous = expense.toObject();
  expense.status = expense.approvalStatus === 'Approved' || expense.approvalStatus === 'Posted' ? 'Posted' : 'Draft';
  expense.approvalStatus = expense.status;
  expense.restoredAt = new Date();
  expense.restoredBy = req.user._id;
  await expense.save();
  await rebuildExpenseLedger();
  await rebuildDayBook();
  await logAudit(req, { action: 'Expense Restored', module: 'Expenses', previousValue: previous, newValue: expense.toObject() });
  res.json({ expense, message: 'Expense restored' });
});

export const expenseLedger = asyncHandler(async (req, res) => {
  await rebuildExpenseLedger();
  const range = dateRange(req.query.from, req.query.to);
  const query = {
    ...(range ? { transactionDate: range } : {}),
    ...(req.query.category ? { category: req.query.category } : {}),
    ...(req.query.paymentMethod ? { paymentMethod: normalizeMethod(req.query.paymentMethod) } : {}),
    ...(req.query.user ? { createdBy: req.query.user } : {}),
    ...(req.query.search ? { $or: [{ voucherNo: new RegExp(req.query.search, 'i') }, { expenseName: new RegExp(req.query.search, 'i') }, { remarks: new RegExp(req.query.search, 'i') }] } : {})
  };
  const entries = await ExpenseLedger.find(query).populate('category', 'name code').populate('createdBy', 'name').sort({ transactionDate: 1, _id: 1 }).lean();
  res.json({ entries, closingBalance: entries.at(-1)?.balance || 0 });
});

export const expenseSummary = asyncHandler(async (req, res) => {
  const now = new Date();
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const range = dateRange(req.query.from, req.query.to);
  const expenses = await Expense.find({ status: { $in: postedStatuses }, ...(range ? { expenseDate: range } : {}) }).populate('category', 'name').lean();
  const inRange = (date, start) => new Date(date) >= start;
  const total = (rows) => rows.reduce((sum, row) => sum + number(row.totalAmount), 0);
  const categoryWise = {};
  const paymentWise = {};
  const userWise = {};
  expenses.forEach((expense) => {
    categoryWise[expense.category?.name || expense.categoryName || 'Uncategorized'] = (categoryWise[expense.category?.name || expense.categoryName || 'Uncategorized'] || 0) + expense.totalAmount;
    paymentWise[expense.paymentMethod] = (paymentWise[expense.paymentMethod] || 0) + expense.totalAmount;
    userWise[String(expense.createdBy)] = (userWise[String(expense.createdBy)] || 0) + expense.totalAmount;
  });
  const sorted = [...expenses].sort((a, b) => b.totalAmount - a.totalAmount);
  const firstDate = expenses.length ? new Date(Math.min(...expenses.map((entry) => new Date(entry.expenseDate).getTime()))) : now;
  const days = Math.max(1, Math.ceil((now - firstDate) / 86400000));
  res.json({
    totalExpense: total(expenses),
    todaysExpense: total(expenses.filter((entry) => inRange(entry.expenseDate, startOfDay))),
    monthlyExpense: total(expenses.filter((entry) => inRange(entry.expenseDate, startOfMonth))),
    yearlyExpense: total(expenses.filter((entry) => inRange(entry.expenseDate, startOfYear))),
    categoryWise,
    paymentMethodWise: paymentWise,
    userWise,
    topExpenseCategories: Object.entries(categoryWise).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([category, amount]) => ({ category, amount })),
    highestExpense: sorted[0] || null,
    lowestExpense: sorted.at(-1) || null,
    averageDailyExpense: total(expenses) / days
  });
});

export const expenseVoucher = asyncHandler(async (req, res) => {
  const expense = await Expense.findById(req.params.id).populate('category', 'name code').populate('supplier', 'name mobile gstNumber address city state pincode').populate('createdBy preparedBy approvedBy', 'name email').lean();
  if (!expense) throw new ApiError(404, 'Expense not found');
  const settings = await Setting.findOne().lean();
  const companyAddress = [settings?.address || settings?.addressLine1, settings?.addressLine2, settings?.city, settings?.state, settings?.pincode].filter(Boolean).join(', ');
  const logo = settings?.logoUrl ? `<img class="logo" src="${esc(settings.logoUrl)}" alt="Logo">` : '';
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(expense.expenseNo)}</title><style>@page{size:A4;margin:14mm}body{font-family:Arial,sans-serif;margin:0;color:#111}.voucher{max-width:760px;margin:auto;border:1px solid #111;padding:24px}.thermal .voucher{max-width:80mm;padding:10px;font-size:11px}.head{text-align:center;border-bottom:1px solid #111;padding-bottom:12px}.logo{max-height:64px;max-width:180px;object-fit:contain}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;margin-top:16px}.row{display:flex;justify-content:space-between;gap:16px}.label{font-weight:700}.amount{font-size:20px;font-weight:700}.qr{height:72px;width:72px;border:1px dashed #555;display:flex;align-items:center;justify-content:center;font-size:10px;color:#555}.sign{display:flex;justify-content:space-between;margin-top:54px;gap:20px}.box{border-top:1px solid #111;min-width:160px;text-align:center;padding-top:8px}.toolbar{margin:12px;text-align:center}@media print{.toolbar{display:none}.voucher{break-inside:avoid}.thermal{width:80mm}.thermal .grid{grid-template-columns:1fr}}</style></head><body class="${req.query.size === 'thermal' ? 'thermal' : 'a4'}"><div class="toolbar"><button onclick="window.print()">Print</button></div><div class="voucher"><div class="head">${logo}<h2>${esc(settings?.companyName || settings?.storeName || 'StoreDesk')}</h2><div>${esc(companyAddress)}</div><div>${esc([settings?.phone || settings?.mobile, settings?.email].filter(Boolean).join(' | '))}</div><div>${esc(settings?.gstNumber ? `GSTIN: ${settings.gstNumber}` : '')}</div><h3>EXPENSE VOUCHER</h3></div><div class="grid"><div><span class="label">Voucher Number:</span> ${esc(expense.expenseNo)}</div><div><span class="label">Expense Date:</span> ${new Date(expense.expenseDate).toLocaleDateString('en-IN')}</div><div><span class="label">Category:</span> ${esc(expense.category?.name || expense.categoryName)}</div><div><span class="label">Payment Method:</span> ${esc(expense.paymentMethod)}</div><div><span class="label">Expense Name:</span> ${esc(expense.expenseName)}</div><div><span class="label">Reference Number:</span> ${esc(expense.referenceNumber || '-')}</div><div><span class="label">Vendor:</span> ${esc(expense.vendor || expense.supplier?.name || '-')}</div><div><span class="label">Status:</span> ${esc(expense.status)}</div><div><span class="label">Taxable Amount:</span> ${Number(expense.taxableAmount ?? expense.amount ?? 0).toFixed(2)}</div><div><span class="label">GST Amount:</span> ${Number(expense.gstAmount || 0).toFixed(2)}</div><div><span class="label">GST Mode:</span> ${expense.gstInclusive ? 'Inclusive' : 'Exclusive'}</div><div class="amount"><span class="label">Amount:</span> ${Number(expense.totalAmount).toFixed(2)}</div></div><p><span class="label">Remarks:</span> ${esc(expense.remarks || expense.description || '-')}</p><div class="row"><div><span class="label">Prepared By:</span> ${esc(expense.preparedBy?.name || expense.createdBy?.name || '')}</div><div><span class="label">Approved By:</span> ${esc(expense.approvedBy?.name || '')}</div><div class="qr">QR<br>Future</div></div><div class="sign"><div class="box">Prepared By</div><div class="box">Approved By</div><div class="box">Signature</div></div></div></body></html>`;
  res.json({ html });
});

export const markExpensePrinted = asyncHandler(async (req, res) => {
  const expense = await Expense.findById(req.params.id);
  if (!expense) throw new ApiError(404, 'Expense not found');
  const action = expense.reprintCount > 0 ? 'Reprinted' : 'Printed';
  await recordVoucherAudit(req, expense, action);
  res.json({ expense });
});

export const approveExpense = asyncHandler(async (req, res) => {
  const expense = await Expense.findById(req.params.id);
  if (!expense) throw new ApiError(404, 'Expense not found');
  const previous = expense.toObject();
  expense.status = 'Approved';
  expense.approvalStatus = 'Approved';
  expense.approvedBy = req.user._id;
  expense.approvalDate = new Date();
  await expense.save();
  await logAudit(req, { action: 'Expense Approved', module: 'Expenses', previousValue: previous, newValue: expense.toObject() });
  res.json({ expense });
});

export const rejectExpense = asyncHandler(async (req, res) => {
  const expense = await Expense.findById(req.params.id);
  if (!expense) throw new ApiError(404, 'Expense not found');
  const previous = expense.toObject();
  expense.status = 'Rejected';
  expense.approvalStatus = 'Rejected';
  expense.approvedBy = req.user._id;
  expense.approvalDate = new Date();
  expense.remarks = [expense.remarks, req.body.reason].filter(Boolean).join('\n');
  await expense.save();
  await rebuildExpenseLedger();
  await rebuildDayBook();
  await logAudit(req, { action: 'Expense Rejected', module: 'Expenses', previousValue: previous, newValue: expense.toObject() });
  res.json({ expense });
});

export const postExpense = asyncHandler(async (req, res) => {
  const expense = await Expense.findById(req.params.id);
  if (!expense) throw new ApiError(404, 'Expense not found');
  const settings = await Setting.findOne().lean();
  if (settings?.expenseApprovalRequired && expense.approvalStatus !== 'Approved') throw new ApiError(400, 'Only approved expenses can be posted');
  const previous = expense.toObject();
  expense.status = 'Posted';
  expense.approvalStatus = 'Posted';
  if (!expense.approvedBy) expense.approvedBy = req.user._id;
  if (!expense.approvalDate) expense.approvalDate = new Date();
  await expense.save();
  await rebuildExpenseLedger();
  await rebuildDayBook();
  await logAudit(req, { action: 'Expense Posted', module: 'Expenses', previousValue: previous, newValue: expense.toObject() });
  res.json({ expense });
});

export const deleteExpenseAttachment = asyncHandler(async (req, res) => {
  const expense = await Expense.findById(req.params.id);
  if (!expense) throw new ApiError(404, 'Expense not found');
  const previous = expense.toObject();
  await deleteAttachmentFile(expense.attachment);
  expense.attachment = undefined;
  await expense.save();
  await logAudit(req, { action: 'Expense Attachment Deleted', module: 'Expenses', previousValue: previous, newValue: { expenseNo: expense.expenseNo } });
  res.json({ expense, message: 'Attachment deleted' });
});

export const downloadExpenseAttachment = asyncHandler(async (req, res) => {
  const expense = await Expense.findById(req.params.id).lean();
  if (!expense?.attachment?.path) throw new ApiError(404, 'Attachment not found');
  const resolved = path.resolve(expense.attachment.path);
  if (!resolved.startsWith(path.resolve(env.uploadDir))) throw new ApiError(400, 'Invalid attachment path');
  await logAudit(req, { action: 'Expense Attachment Downloaded', module: 'Expenses', newValue: { expenseNo: expense.expenseNo } });
  res.download(resolved, expense.attachment.originalName || expense.attachment.filename);
});

export const exportExpenseVoucherPdf = asyncHandler(async (req, res) => {
  const expense = await Expense.findById(req.params.id).populate('category', 'name code').populate('createdBy preparedBy approvedBy', 'name email').lean();
  if (!expense) throw new ApiError(404, 'Expense not found');
  const settings = await Setting.findOne().lean();
  const doc = new PDFDocument({ size: req.query.size === 'thermal' ? [226.77, 650] : 'A4', margin: 36 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=${expense.expenseNo}.pdf`);
  doc.pipe(res);
  doc.fontSize(16).text(settings?.companyName || settings?.storeName || 'StoreDesk', { align: 'center' });
  doc.fontSize(9).text([settings?.address || settings?.addressLine1, settings?.city, settings?.state, settings?.pincode].filter(Boolean).join(', '), { align: 'center' });
  if (settings?.gstNumber) doc.text(`GSTIN: ${settings.gstNumber}`, { align: 'center' });
  doc.moveDown().fontSize(14).text('EXPENSE VOUCHER', { align: 'center', underline: true }).moveDown();
  [
    ['Voucher Number', expense.expenseNo],
    ['Expense Date', new Date(expense.expenseDate).toLocaleDateString('en-IN')],
    ['Category', expense.category?.name || expense.categoryName],
    ['Expense Name', expense.expenseName],
    ['Taxable Amount', Number(expense.taxableAmount ?? expense.amount ?? 0).toFixed(2)],
    ['GST Amount', Number(expense.gstAmount || 0).toFixed(2)],
    ['Amount', Number(expense.totalAmount || 0).toFixed(2)],
    ['Payment Method', expense.paymentMethod],
    ['Reference Number', expense.referenceNumber || '-'],
    ['Vendor', expense.vendor || '-'],
    ['Remarks', expense.remarks || expense.description || '-'],
    ['Prepared By', expense.preparedBy?.name || expense.createdBy?.name || '-'],
    ['Approved By', expense.approvedBy?.name || '-']
  ].forEach(([label, value]) => doc.fontSize(10).text(`${label}: ${value}`));
  doc.moveDown(3).text('Prepared By', 36, doc.y, { continued: true }).text('Approved By', { align: 'center', continued: true }).text('Signature', { align: 'right' });
  doc.end();
  await Expense.updateOne({ _id: expense._id }, { $push: { voucherAudit: voucherAuditEntry(req, expense, 'Exported') } });
  await logAudit(req, { action: 'Expense Voucher Exported', module: 'Expenses', newValue: { expenseNo: expense.expenseNo } });
});
