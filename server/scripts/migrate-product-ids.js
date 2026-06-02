#!/usr/bin/env node
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load environment from project root .env if present
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Import DB config and Product model
import { connectDB } from '../src/config/db.js';

// Lazy load the Product model to avoid circular issues
async function loadProductModel() {
  const mod = await import('../src/models/Product.js');
  return mod.default || mod.Product || mod.ProductModel || mod;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { dryRun: false, startId: null, backup: false };
  for (const a of args) {
    if (a === '--dry-run') opts.dryRun = true;
    if (a === '--backup') opts.backup = true;
    if (a.startsWith('--start=')) opts.startId = Number(a.split('=')[1]);
  }
  return opts;
}

async function run() {
  const opts = parseArgs();
  try {
    await connectDB();
    const Product = await loadProductModel();

    console.log('Connected. Scanning products for missing productId...');

    // Find max existing numeric productId
    const maxDoc = await Product.find({ productId: { $type: 'number' } })
      .sort({ productId: -1 })
      .limit(1)
      .lean();

    let start = 1000;
    if (opts.startId && Number.isInteger(opts.startId)) start = Math.max(start, opts.startId);
    if (maxDoc && maxDoc.length > 0 && typeof maxDoc[0].productId === 'number') {
      start = Math.max(start, maxDoc[0].productId + 1);
    }

    console.log('Starting assignment from productId =', start, opts.dryRun ? '(dry-run)' : '');

    // Optionally backup current products that are missing productId
    const toProcess = await Product.find({ $or: [ { productId: { $exists: false } }, { productId: { $type: 'string' } } ] }).lean();
    if (toProcess.length === 0) {
      console.log('No products found that require productId assignment.');
      process.exit(0);
    }

    if (opts.backup) {
      const backupPath = path.resolve(process.cwd(), 'product-id-migration-backup.json');
      fs.writeFileSync(backupPath, JSON.stringify(toProcess, null, 2));
      console.log('Backup written to', backupPath);
    }

    const assignments = [];
    let count = 0;
    for (const doc of toProcess) {
      // Assign next numeric id
      let assigned = start++;
      // Ensure uniqueness by checking another doc with same id
      // NOTE: this is conservative; for very large DBs consider a transaction or a separate lock
      while (await Product.findOne({ productId: assigned }).lean()) {
        assigned = start++;
      }

      assignments.push({ _id: doc._id, oldProductId: doc.productId || null, assigned });

      if (!opts.dryRun) {
        // perform update
        await Product.updateOne({ _id: doc._id }, { $set: { productId: assigned } });
      }

      count++;
      if (count % 50 === 0) console.log(`Processed ${count} items...`);
    }

    console.log(`Completed processing ${count} products.`);
    if (opts.dryRun) {
      console.log('Dry-run mode — no changes were saved. Example assignments:');
      console.log(assignments.slice(0, 20));
      console.log('Run with --backup to write a JSON backup and without --dry-run to apply changes.');
    } else {
      console.log('Migration applied. Sample assignments:');
      console.log(assignments.slice(0, 20));
    }

    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(2);
  }
}

run();
