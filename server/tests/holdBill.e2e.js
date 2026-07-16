import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { app } from '../src/app.js';
import { connectDB } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';

async function startInMemoryMongo() {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  env.mongoUri = process.env.MONGO_URI;
  return mongod;
}

function assert(condition, msg) {
  if (!condition) {
    console.error('ASSERTION FAILED:', msg);
    process.exit(2);
  }
}

async function run() {
  const mongod = await startInMemoryMongo();
  try {
    await connectDB();

    // create a test user
    const user = new User({ name: 'Test', email: 'test@example.com', password: 'password123', role: 'cashier' });
    await user.save();

    const token = jwt.sign({ id: user._id }, env.jwtSecret || 'development-only-secret');
    const baseUrl = await new Promise((resolve) => {
      const server = app.listen(0, () => resolve(`http://127.0.0.1:${server.address().port}/api`));
    });

    const heldPayload = {
      invoiceNo: 'HELD-001',
      invoiceAt: '2026-07-15T10:30:00.000Z',
      customer: {
        id: 'cust-1',
        name: 'Credit Customer',
        mobile: '9999999999',
        address: 'Main Road',
        city: 'Chennai',
        gstNumber: '33ABCDE1234F1Z5',
        panNumber: 'ABCDE1234F',
        creditLimit: 5000,
        openingBalance: 250,
        currentOutstanding: 321,
        remarks: 'Snapshot customer'
      },
      items: [{
        productId: 1234,
        productIdNumber: 1234,
        name: 'Test Product',
        productName: 'Test Product',
        localName: 'Tamil Test',
        sku: 'SKU-HELD',
        barcode: '8901234567890',
        hsnCode: '3923',
        unit: 'pcs',
        quantity: 2,
        freeQuantity: 1,
        price: 99.5,
        rate: 99.5,
        priceMode: 'wholesale',
        discountPercent: 10,
        discount: 19.9,
        gst: 12,
        gstRate: 12,
        gstAmount: 21.49,
        gstInclusive: false,
        taxableAmount: 179.1,
        lineTotal: 200.59,
        netAmount: 200.59,
        total: 200.59,
        batch: 'B1',
        expiry: '2027-03',
        remarks: 'Keep exact'
      }],
      subtotal: 179.1,
      taxTotal: 21.49,
      discount: 19.9,
      discountPercent: 0,
      discountAmount: 0,
      total: 200.59,
      paymentMethod: 'credit',
      paymentDetails: [{ method: 'Credit', amount: 50, reference: 'PART' }],
      paidAmount: 50,
      amountPaid: 50,
      balanceAmount: 150.59,
      balanceDue: 150.59,
      outstanding: 150.59,
      cashReceived: 0,
      changeReturn: 0,
      payment: {
        paymentMethod: 'Credit',
        paidAmount: 50,
        amountPaid: 50,
        balanceAmount: 150.59,
        outstanding: 150.59,
        creditAmount: 150.59,
        paymentDetails: [{ method: 'Credit', amount: 50, reference: 'PART' }]
      },
      customerName: 'Credit Customer',
      customerMobile: '9999999999'
    };

    // 1. Hold a bill
    const holdResp = await fetch(`${baseUrl}/hold-bills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(heldPayload)
    });
    assert(holdResp.status === 201, 'hold response should be 201');
    const holdBody = await holdResp.json();
    assert(holdBody.heldBill && holdBody.heldBill._id, 'heldBill exists');
    const heldId = holdBody.heldBill._id;

    // 2. List held bills
    const listResp = await fetch(`${baseUrl}/hold-bills`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert(listResp.status === 200, 'list response 200');
    const listBody = await listResp.json();
    assert(Array.isArray(listBody.heldBills) && listBody.heldBills.length === 1, 'one held bill present');

    // 3. Resume held bill
    const resumeResp = await fetch(`${baseUrl}/hold-bills/${heldId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert(resumeResp.status === 200, 'resume response 200');
    const resumeBody = await resumeResp.json();
    assert(resumeBody.heldBill && resumeBody.heldBill.items && resumeBody.heldBill.items.length === 1, 'resume returned items');
    assert(resumeBody.snapshot && Array.isArray(resumeBody.snapshot.cart), 'resume returned snapshot cart');
    const resumedItem = resumeBody.snapshot.cart[0];
    assert(resumedItem.price === 99.5, 'resume preserves price');
    assert(resumedItem.gstAmount === 21.49, 'resume preserves GST amount');
    assert(resumedItem.discount === 19.9, 'resume preserves discount');
    assert(resumedItem.priceMode === 'wholesale', 'resume preserves price mode');
    assert(resumeBody.snapshot.payment.balanceAmount === 150.59, 'resume preserves outstanding balance');
    assert(resumeBody.snapshot.customer.gstNumber === '33ABCDE1234F1Z5', 'resume preserves customer GST');
    assert(resumeBody.snapshot.totals.total === 200.59, 'resume preserves total');

    // 4. Delete held bill
    const delResp = await fetch(`${baseUrl}/hold-bills/${heldId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    assert(delResp.status === 200, 'delete response 200');

    // 5. Confirm deletion
    const listResp2 = await fetch(`${baseUrl}/hold-bills`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const listBody2 = await listResp2.json();
    assert(Array.isArray(listBody2.heldBills) && listBody2.heldBills.length === 0, 'no held bills remain');

    console.log('E2E hold/resume test passed');
    process.exit(0);
  } catch (err) {
    console.error('E2E test failed:', err);
    process.exit(2);
  } finally {
    try { await mongoose.disconnect(); } catch(_) {}
    try { await mongod.stop(); } catch(_) {}
  }
}

run();
