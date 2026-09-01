import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { app } from '../src/app.js';
import { connectDB } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { Product } from '../src/models/Product.js';
import Bill from '../src/models/Bill.js';

function assert(condition, msg) {
  if (!condition) {
    console.error('ASSERTION FAILED:', msg);
    process.exit(2);
  }
}

async function startInMemoryMongo() {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  env.mongoUri = process.env.MONGO_URI;
  return mongod;
}

let productCounter = 9000;
let invoiceCounter = 1;

async function createProduct({ unit = 'pcs', allowDecimalQty = false, stock = 100, price = 100 } = {}) {
  productCounter += 1;
  return Product.create({
    productId: productCounter,
    name: `Test ${unit} ${productCounter}`,
    sku: `SKU${productCounter}`,
    purchasePrice: price / 2,
    sellingPrice: price,
    stock,
    unit,
    allowDecimalQty,
    active: true
  });
}

function billPayload(product, {
  quantity = 1,
  total,
  paymentMethod = 'cash',
  amountPaid,
  cashReceived,
  paymentDetails
} = {}) {
  const resolvedTotal = total ?? Math.max(Number(quantity) * Number(product.sellingPrice), 0);
  const resolvedPaid = amountPaid ?? resolvedTotal;
  return {
    invoiceNo: `TEST-BILL-${invoiceCounter++}`,
    items: [{
      productId: String(product._id),
      productName: product.name,
      quantity,
      unit: product.unit,
      price: product.sellingPrice,
      sellingPrice: product.sellingPrice,
      gst: 0,
      gstRate: 0,
      netAmount: resolvedTotal,
      total: resolvedTotal
    }],
    subtotal: resolvedTotal,
    taxTotal: 0,
    discount: 0,
    discountPercent: 0,
    discountAmount: 0,
    total: resolvedTotal,
    paymentMethod,
    amountPaid: resolvedPaid,
    paidAmount: resolvedPaid,
    cashReceived,
    paymentDetails
  };
}

async function postBill(baseUrl, token, payload) {
  const response = await fetch(`${baseUrl}/bills`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function expectBill(baseUrl, token, payload, status = 201) {
  const result = await postBill(baseUrl, token, payload);
  assert(result.response.status === status, `expected bill response ${status}, got ${result.response.status}: ${JSON.stringify(result.body)}`);
  return result.body.bill;
}

async function run() {
  const mongod = await startInMemoryMongo();
  let server;
  let exitCode = 0;
  try {
    await connectDB();

    const user = new User({ name: 'Billing Tester', email: 'billing-tester@example.com', password: 'password123', role: 'cashier' });
    await user.save();

    const token = jwt.sign({ id: user._id }, env.jwtSecret || 'development-only-secret');
    const baseUrl = await new Promise((resolve) => {
      server = app.listen(0, () => resolve(`http://127.0.0.1:${server.address().port}/api`));
    });

    const fullCashProduct = await createProduct({ stock: 10, price: 2720 });
    const fullCashBill = await expectBill(baseUrl, token, billPayload(fullCashProduct, {
      quantity: 1,
      total: 2720,
      amountPaid: 2720,
      cashReceived: 2720
    }));
    assert(fullCashBill.total === 2720, 'full cash stores invoice total');
    assert(fullCashBill.paidAmount === 2720, 'full cash stores amount paid');
    assert(fullCashBill.cashReceived === 2720, 'full cash stores cash received');
    assert(fullCashBill.changeReturn === 0, 'full cash change is zero');
    assert(fullCashBill.balanceAmount === 0, 'full cash balance is zero');
    assert(fullCashBill.paymentMethod === 'Cash', 'full cash payment method stored');

    const partialCashProduct = await createProduct({ stock: 10, price: 2720 });
    const partialCashBill = await expectBill(baseUrl, token, billPayload(partialCashProduct, {
      quantity: 1,
      total: 2720,
      amountPaid: 2500,
      cashReceived: 2500
    }));
    assert(partialCashBill.paidAmount === 2500, 'partial cash stores amount paid');
    assert(partialCashBill.cashReceived === 2500, 'partial cash stores cash received');
    assert(partialCashBill.changeReturn === 0, 'partial cash equal tender has no change');
    assert(partialCashBill.balanceAmount === 220, 'partial cash creates outstanding amount');
    assert(partialCashBill.dueAmount === 220, 'partial cash stores due amount');
    assert(partialCashBill.paymentStatus === 'Partial', 'partial cash stores partial status');

    const changeProduct = await createProduct({ stock: 10, price: 2720 });
    const changeBill = await expectBill(baseUrl, token, billPayload(changeProduct, {
      quantity: 1,
      total: 2720,
      amountPaid: 2500,
      cashReceived: 2600
    }));
    assert(changeBill.changeReturn === 100, 'change is cash received minus amount paid');
    assert(changeBill.balanceAmount === 220, 'change bill keeps outstanding total minus amount paid');

    const rejectedCashProduct = await createProduct({ stock: 10, price: 2720 });
    const rejectedCash = await postBill(baseUrl, token, billPayload(rejectedCashProduct, {
      quantity: 1,
      total: 2720,
      amountPaid: 2500,
      cashReceived: 2499
    }));
    assert(rejectedCash.response.status === 400, 'cash received less than amount paid is rejected');
    assert(/Cash received cannot be less than amount paid/.test(rejectedCash.body.message), 'cash rejection message names amount paid');

    const splitProduct = await createProduct({ stock: 10, price: 100 });
    const splitBill = await expectBill(baseUrl, token, billPayload(splitProduct, {
      quantity: 1,
      total: 100,
      paymentMethod: 'split',
      amountPaid: 100,
      paymentDetails: [
        { method: 'cash', amount: 60 },
        { method: 'upi', amount: 40 }
      ]
    }));
    assert(splitBill.paymentMethod === 'Split', 'split payment method stored');
    assert(splitBill.paidAmount === 100, 'split paid total stored');
    assert(splitBill.cashReceived === 0, 'split does not use cash received field');
    assert(splitBill.changeReturn === 0, 'split does not calculate cash change');

    const kgProduct = await createProduct({ unit: 'kg', allowDecimalQty: true, stock: 10, price: 100 });
    await expectBill(baseUrl, token, billPayload(kgProduct, { quantity: 0.1, total: 10, amountPaid: 10, cashReceived: 10 }));
    let reloadedKg = await Product.findById(kgProduct._id).lean();
    assert(Math.abs(reloadedKg.stock - 9.9) < 0.000001, '0.1 kg deducts decimal stock');
    await expectBill(baseUrl, token, billPayload(kgProduct, { quantity: 0.5, total: 50, amountPaid: 50, cashReceived: 50 }));
    await expectBill(baseUrl, token, billPayload(kgProduct, { quantity: 1.25, total: 125, amountPaid: 125, cashReceived: 125 }));
    reloadedKg = await Product.findById(kgProduct._id).lean();
    assert(Math.abs(reloadedKg.stock - 8.15) < 0.000001, 'multiple decimal kg sales deduct stock correctly');

    const pcsProduct = await createProduct({ unit: 'pcs', allowDecimalQty: false, stock: 10, price: 25 });
    await expectBill(baseUrl, token, billPayload(pcsProduct, { quantity: 2, total: 50, amountPaid: 50, cashReceived: 50 }));
    const pcsAfterWhole = await Product.findById(pcsProduct._id).lean();
    assert(pcsAfterWhole.stock === 8, 'whole-number pcs sale deducts stock');

    const decimalPcs = await postBill(baseUrl, token, billPayload(pcsProduct, { quantity: 0.5, total: 12.5, amountPaid: 12.5, cashReceived: 12.5 }));
    assert(decimalPcs.response.status === 400, 'decimal pcs sale is rejected');
    assert(/whole number quantity/.test(decimalPcs.body.message), 'decimal pcs rejection message names whole number rule');

    const zeroQty = await postBill(baseUrl, token, billPayload(kgProduct, { quantity: 0, total: 10, amountPaid: 10, cashReceived: 10 }));
    assert(zeroQty.response.status === 400, 'zero quantity is rejected');
    assert(/greater than zero/.test(zeroQty.body.message), 'zero quantity rejection message names positive quantity');

    const negativeQty = await postBill(baseUrl, token, billPayload(kgProduct, { quantity: -1, total: 10, amountPaid: 10, cashReceived: 10 }));
    assert(negativeQty.response.status === 400, 'negative quantity is rejected');
    assert(/greater than zero/.test(negativeQty.body.message), 'negative quantity rejection message names positive quantity');

    assert(await Bill.countDocuments() === 8, 'only accepted test bills were saved');
    console.log('Billing validation E2E test passed');
  } catch (err) {
    console.error('Billing validation E2E test failed:', err);
    exitCode = 2;
  } finally {
    try { if (server) await new Promise((resolve) => server.close(resolve)); } catch (_) {}
    try { await mongoose.disconnect(); } catch (_) {}
    try { await mongod.stop(); } catch (_) {}
  }
  process.exit(exitCode);
}

run();
