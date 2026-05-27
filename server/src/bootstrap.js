import { Category } from './models/Category.js';
import { Product } from './models/Product.js';
import { Setting } from './models/Setting.js';
import { User } from './models/User.js';

export async function ensureDefaultData() {
  const admin = await User.findOne({ email: 'admin@store.com' });
  if (!admin) {
    await User.create({
      name: 'Store Admin',
      email: 'admin@store.com',
      password: 'Admin@12345',
      role: 'admin',
      permissions: ['all']
    });
  }

  await Setting.findOneAndUpdate({}, {}, { upsert: true, new: true, setDefaultsOnInsert: true });

  const grocery = await Category.findOneAndUpdate(
    { name: 'Grocery' },
    { name: 'Grocery', taxRate: 5, active: true },
    { upsert: true, new: true }
  );
  const dairy = await Category.findOneAndUpdate(
    { name: 'Dairy' },
    { name: 'Dairy', taxRate: 5, active: true },
    { upsert: true, new: true }
  );

  const products = [
    { name: 'Basmati Rice 1kg', sku: 'BAS-00001', category: grocery._id, purchasePrice: 90, sellingPrice: 120, taxRate: 5, stock: 50, lowStockThreshold: 10 },
    { name: 'Whole Wheat Atta 5kg', sku: 'WHO-00002', category: grocery._id, purchasePrice: 190, sellingPrice: 240, taxRate: 5, stock: 35, lowStockThreshold: 8 },
    { name: 'Fresh Milk 1L', sku: 'FRE-00003', category: dairy._id, purchasePrice: 48, sellingPrice: 60, taxRate: 0, stock: 80, lowStockThreshold: 15 }
  ];

  for (const product of products) {
    await Product.findOneAndUpdate({ sku: product.sku }, product, { upsert: true, new: true });
  }
}
