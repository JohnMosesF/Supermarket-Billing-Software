import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBillItemSnapshot } from '../src/utils/billItemSnapshot.js';

test('normalizeBillItemSnapshot preserves invoice-critical product fields', () => {
  const item = normalizeBillItemSnapshot({
    _id: '507f1f77bcf86cd799439011',
    productName: 'Milk',
    quantity: 2,
    unit: 'pcs',
    price: 40,
    gst: 5,
    total: 84,
    discount: 4,
    sku: 'SKU1',
    barcode: '123456',
    localName: 'दूध',
    mrp: 45,
    purchasePrice: 35,
    category: 'Dairy',
    companyName: 'Fresh Co',
    hsnCode: '0401',
    wholesalePrice: 38,
    stock: 10,
    productIdNumber: 1001,
    productIdValue: '1001',
  });

  assert.equal(item.productName, 'Milk');
  assert.equal(item.sku, 'SKU1');
  assert.equal(item.barcode, '123456');
  assert.equal(item.localName, 'दूध');
  assert.equal(item.mrp, 45);
  assert.equal(item.purchasePrice, 35);
  assert.equal(item.category, 'Dairy');
  assert.equal(item.companyName, 'Fresh Co');
  assert.equal(item.hsnCode, '0401');
  assert.equal(item.wholesalePrice, 38);
  assert.equal(item.stockAtSale, 10);
  assert.equal(item.productIdNumber, 1001);
});
