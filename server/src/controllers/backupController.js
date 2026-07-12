import { Category } from '../models/Category.js';
import { Customer } from '../models/Customer.js';
import { AuditLog } from '../models/AuditLog.js';
import { CustomerLedger } from '../models/CustomerLedger.js';
import { CustomerReceipt } from '../models/CustomerReceipt.js';
import { DayBookEntry } from '../models/DayBookEntry.js';
import { InventoryLog } from '../models/InventoryLog.js';
import { Product } from '../models/Product.js';
import { Purchase } from '../models/Purchase.js';
import { PurchaseOrder } from '../models/PurchaseOrder.js';
import { PurchaseReturn } from '../models/PurchaseReturn.js';
import { Sale } from '../models/Sale.js';
import { SalesReturn } from '../models/SalesReturn.js';
import { Setting } from '../models/Setting.js';
import { Supplier } from '../models/Supplier.js';
import { SupplierLedger } from '../models/SupplierLedger.js';
import { SupplierPayment } from '../models/SupplierPayment.js';
import { SupplierPriceHistory } from '../models/SupplierPriceHistory.js';
import { User } from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { logAudit } from '../utils/audit.js';

const collections = {
  users: User,
  categories: Category,
  products: Product,
  customers: Customer,
  suppliers: Supplier,
  sales: Sale,
  purchases: Purchase,
  purchaseOrders: PurchaseOrder,
  supplierPriceHistory: SupplierPriceHistory,
  salesReturns: SalesReturn,
  purchaseReturns: PurchaseReturn,
  customerReceipts: CustomerReceipt,
  supplierPayments: SupplierPayment,
  customerLedgers: CustomerLedger,
  supplierLedgers: SupplierLedger,
  dayBookEntries: DayBookEntry,
  auditLogs: AuditLog,
  inventoryLogs: InventoryLog,
  settings: Setting
};

async function backupPayload() {
  const payload = { createdAt: new Date().toISOString(), version: 2, data: {} };
  for (const [key, Model] of Object.entries(collections)) {
    payload.data[key] = await Model.find().lean();
  }
  return payload;
}

export const createBackup = asyncHandler(async (req, res) => {
  const payload = await backupPayload();
  await logAudit(req, { action: 'Backup Database', module: 'Settings', newValue: { collections: Object.keys(payload.data) } });

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename=supermarket-backup-${Date.now()}.json`);
  res.json(payload);
});

export const restoreBackup = asyncHandler(async (req, res) => {
  if (req.body.confirmation !== 'RESTORE') {
    throw new ApiError(400, 'Type RESTORE to confirm database restore');
  }

  const payload = JSON.parse(req.body.payload || '{}');
  if (!payload.data || typeof payload.data !== 'object') throw new ApiError(400, 'Invalid backup file');
  const preRestoreBackup = req.body.backupBeforeRestore === 'false' ? null : await backupPayload();
  const restored = {};

  for (const [key, Model] of Object.entries(collections)) {
    if (!Array.isArray(payload.data?.[key])) continue;
    await Model.deleteMany({});
    if (payload.data[key].length) await Model.insertMany(payload.data[key], { ordered: false });
    restored[key] = payload.data[key].length;
  }

  await logAudit(req, { action: 'Restore Database', module: 'Settings', previousValue: preRestoreBackup ? { createdAt: preRestoreBackup.createdAt } : null, newValue: { restored } });
  res.json({ message: 'Backup restored', restored, preRestoreBackup });
});
