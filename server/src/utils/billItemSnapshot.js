import mongoose from 'mongoose';

export function normalizeBillItemSnapshot(it = {}, product = null) {
  const quantity = Number(it.quantity ?? it.qty ?? 0.001);
  const price = Number(it.price ?? it.sellingPrice ?? it.rate ?? 0);
  const gst = Number(it.gst ?? it.taxRate ?? it.tax ?? 0);
  const total = Number(it.total != null ? it.total : price * quantity);
  const discount = Number(it.discount ?? 0);
  const productIdValue = it.productId ?? it._id ?? it.product ?? null;
  const productIdObj = productIdValue && mongoose.Types.ObjectId.isValid(String(productIdValue))
    ? new mongoose.Types.ObjectId(String(productIdValue))
    : null;
  const productSnapshot = product || {};

  return {
    productId: productIdObj,
    productIdNumber: Number(it.productIdNumber ?? it.numericProductId ?? productSnapshot.productId ?? 0) || undefined,
    sku: String(it.sku ?? productSnapshot.sku ?? it.code ?? '').trim(),
    barcode: String(it.barcode ?? productSnapshot.barcode ?? '').trim(),
    productName: String(it.productName || it.name || productSnapshot.name || '').trim(),
    localName: String(it.localName ?? productSnapshot.localName ?? '').trim(),
    unit: String(it.unit || productSnapshot.unit || 'pcs').trim().toLowerCase(),
    quantity,
    purchasePrice: Number(it.purchasePrice ?? productSnapshot.purchasePrice ?? 0),
    sellingPrice: Number(it.sellingPrice ?? it.price ?? productSnapshot.sellingPrice ?? price),
    mrp: Number(it.mrp ?? productSnapshot.mrp ?? 0),
    gst: gst,
    gstAmount: Number(it.gstAmount ?? ((Math.max(quantity * price - discount, 0) * gst) / 100)),
    taxableAmount: Math.max(quantity * price - discount, 0),
    netAmount: total,
    discount,
    category: String(it.category ?? productSnapshot.category ?? '').trim(),
    companyName: String(it.companyName ?? productSnapshot.companyName ?? '').trim(),
    stockAtSale: Number(it.stockAtSale ?? it.stock ?? productSnapshot.stock ?? 0),
    metadata: it.metadata ?? productSnapshot.metadata ?? {}
  };
}
