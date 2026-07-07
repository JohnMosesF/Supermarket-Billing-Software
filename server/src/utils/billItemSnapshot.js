import mongoose from 'mongoose';

export function normalizeBillItemSnapshot(it = {}, product = null) {
  const quantity = Number(it.quantity ?? it.qty ?? 0.001);
  const price = Number(it.price ?? it.sellingPrice ?? it.rate ?? 0);
  const gst = Number(it.gstRate ?? it.gst ?? it.taxRate ?? it.tax ?? product?.taxRate ?? 0);
  const total = Number(it.netAmount ?? it.total ?? it.amount ?? (price * quantity));
  const discount = Number(it.discount ?? 0);
  const nestedProduct = it.product && typeof it.product === 'object' ? it.product : {};
  const productIdValue = nestedProduct._id ?? it.mongoId ?? it.productId ?? it._id ?? it.product ?? null;
  const productIdObj = productIdValue && mongoose.Types.ObjectId.isValid(String(productIdValue))
    ? new mongoose.Types.ObjectId(String(productIdValue))
    : null;
  const productSnapshot = product || {};

  return {
    productId: productIdObj,
    productIdNumber: Number(it.productIdNumber ?? it.numericProductId ?? it.productIdValue ?? nestedProduct.productId ?? productSnapshot.productId ?? 0) || undefined,
    sku: String(it.sku ?? productSnapshot.sku ?? it.code ?? '').trim(),
    barcode: String(it.barcode ?? productSnapshot.barcode ?? '').trim(),
    productName: String(it.productName || it.name || productSnapshot.name || '').trim(),
    localName: String(it.localName ?? productSnapshot.localName ?? '').trim(),
    unit: String(it.unit || productSnapshot.unit || 'pcs').trim().toLowerCase(),
    quantity,
    purchasePrice: Number(it.purchasePrice ?? productSnapshot.purchasePrice ?? 0),
    sellingPrice: Number(it.sellingPrice ?? it.price ?? productSnapshot.sellingPrice ?? price),
    mrp: Number(it.mrp ?? productSnapshot.mrp ?? 0),
    wholesalePrice: Number(it.wholesalePrice ?? productSnapshot.wholesalePrice ?? 0),
    gst: gst,
    gstAmount: Number(it.gstAmount ?? ((Math.max(quantity * price - discount, 0) * gst) / 100)),
    taxableAmount: Math.max(quantity * price - discount, 0),
    netAmount: total,
    discount,
    category: String(it.category ?? productSnapshot.category ?? '').trim(),
    companyName: String(it.companyName ?? productSnapshot.companyName ?? '').trim(),
    hsnCode: String(it.hsnCode ?? it.hsn ?? productSnapshot.hsnCode ?? '').trim(),
    stockAtSale: Number(it.stockAtSale ?? it.stock ?? productSnapshot.stock ?? 0),
    metadata: it.metadata ?? productSnapshot.metadata ?? {}
  };
}
