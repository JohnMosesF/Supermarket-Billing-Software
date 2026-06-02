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

    // 1. Hold a bill
    const holdResp = await fetch(`${baseUrl}/hold-bills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        items: [{ productId: 1234, name: 'Test Product', quantity: 2, sellingPrice: 10, taxRate: 5 }],
        subtotal: 20,
        taxTotal: 1,
        discount: 0,
        total: 21,
        paymentMethod: 'cash',
        customerName: 'Test',
        customerMobile: '9999999999'
      })
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
