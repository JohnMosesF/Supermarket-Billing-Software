import { Category } from '../models/Category.js';
import { Customer } from '../models/Customer.js';
import { InventoryLog } from '../models/InventoryLog.js';
import { Product } from '../models/Product.js';
import { Purchase } from '../models/Purchase.js';
import { Sale } from '../models/Sale.js';
import { Setting } from '../models/Setting.js';
import { Supplier } from '../models/Supplier.js';
import { User } from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const collections = {
  users: User,
  categories: Category,
  products: Product,
  customers: Customer,
  suppliers: Supplier,
  sales: Sale,
  purchases: Purchase,
  inventoryLogs: InventoryLog,
  settings: Setting
};

export const createBackup = asyncHandler(async (req, res) => {
  const payload = { createdAt: new Date().toISOString(), version: 1, data: {} };
  for (const [key, Model] of Object.entries(collections)) {
    payload.data[key] = await Model.find().lean();
  }

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename=supermarket-backup-${Date.now()}.json`);
  res.json(payload);
});

export const restoreBackup = asyncHandler(async (req, res) => {
  const payload = JSON.parse(req.body.payload || '{}');
  const restored = {};

  for (const [key, Model] of Object.entries(collections)) {
    if (!Array.isArray(payload.data?.[key])) continue;
    await Model.deleteMany({});
    if (payload.data[key].length) await Model.insertMany(payload.data[key], { ordered: false });
    restored[key] = payload.data[key].length;
  }

  res.json({ message: 'Backup restored', restored });
});
