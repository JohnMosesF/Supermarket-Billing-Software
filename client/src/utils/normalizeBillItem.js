const OBJECT_ID = /^[a-f\d]{24}$/i;

const value = (...values) => values.find((entry) => entry !== undefined && entry !== null && entry !== '');
const number = (...values) => {
  const parsed = Number(value(...values));
  return Number.isFinite(parsed) ? parsed : 0;
};
const text = (...values) => {
  const selected = value(...values);
  if (selected === undefined || selected === null) return '';
  if (typeof selected === 'object') {
    return String(value(selected.name, selected.label, selected.title, selected.productId, selected._id, '') || '');
  }
  return String(selected);
};

/** Convert every historical/current cart or persisted bill-item shape to one safe UI shape. */
export function normalizeBillItem(item = {}) {
  const source = item && typeof item === 'object' ? item : {};
  const product = source.product && typeof source.product === 'object'
    ? source.product
    : source.productId && typeof source.productId === 'object'
      ? source.productId
      : {};
  const productRef = typeof source.product === 'string' ? source.product : '';
  const rawProductId = value(source.productIdNumber, source.numericProductId, source.productIdValue);
  const ambiguousProductId = value(
    source.productId && typeof source.productId !== 'object' ? source.productId : undefined,
    product.productId
  );
  const mongoId = text(
    source.mongoId,
    product._id,
    OBJECT_ID.test(String(productRef)) ? productRef : '',
    OBJECT_ID.test(String(ambiguousProductId || '')) ? ambiguousProductId : '',
    OBJECT_ID.test(String(source._id || '')) ? source._id : ''
  );
  const productId = text(
    rawProductId,
    ambiguousProductId && !OBJECT_ID.test(String(ambiguousProductId)) ? ambiguousProductId : '',
    product.productId,
    source.code
  );
  const quantity = number(source.quantity, source.qty);
  const price = number(source.price, source.rate, source.sellingPrice, product.sellingPrice);
  const sellingPrice = number(source.sellingPrice, source.price, source.rate, product.sellingPrice);
  const discountPercent = number(source.discountPercent, source.discountPct);
  const grossAmount = quantity * price;
  const discount = number(source.discount, discountPercent > 0 ? grossAmount * discountPercent / 100 : 0);
  const gstRate = number(source.gstRate, source.gst, source.taxRate, source.tax, product.gstRate, product.taxRate);
  const gstInclusive = Boolean(value(source.gstInclusive, product.gstInclusive, false));
  const taxableBase = Math.max(grossAmount - discount, 0);
  const computedGst = gstInclusive && gstRate > 0
    ? taxableBase - taxableBase / (1 + gstRate / 100)
    : taxableBase * gstRate / 100;
  const computedTaxable = gstInclusive ? taxableBase - computedGst : taxableBase;
  const taxableAmount = number(source.taxableAmount, computedTaxable);
  const gstAmount = number(source.gstAmount, computedGst);
  const computedNet = gstInclusive ? taxableBase : taxableAmount + gstAmount;

  return {
    mongoId,
    productId,
    sku: text(source.sku, source.productCode, source.code, product.sku),
    barcode: text(source.barcode, product.barcode),
    productName: text(source.productName, source.name, source.itemName, product.productName, product.name),
    localName: text(source.localName, product.localName),
    companyName: text(source.companyName, source.company, product.companyName, product.company),
    category: text(source.category, product.category),
    hsnCode: text(source.hsnCode, source.hsn, product.hsnCode, product.hsn),
    unit: text(source.unit, product.unit, 'pcs') || 'pcs',
    quantity,
    price,
    sellingPrice,
    purchasePrice: number(source.purchasePrice, product.purchasePrice),
    wholesalePrice: number(source.wholesalePrice, product.wholesalePrice),
    mrp: number(source.mrp, product.mrp),
    priceMode: text(source.priceMode, source.pricingMode, 'retail') || 'retail',
    discountMode: text(source.discountMode, discountPercent > 0 ? 'percent' : 'amount') || 'amount',
    gstInclusive,
    discount,
    discountPercent,
    gstRate,
    gstAmount,
    taxableAmount,
    netAmount: number(source.netAmount, source.lineTotal, source.total, source.amount, computedNet),
    stockAtSale: number(source.stockAtSale, source.stock, product.stockAtSale, product.stock),
    allowDecimalQty: Boolean(value(source.allowDecimalQty, product.allowDecimalQty, false)),
    metadata: source.metadata && typeof source.metadata === 'object' ? source.metadata : {}
  };
}

export function normalizeBillItems(items = []) {
  return Array.isArray(items) ? items.map(normalizeBillItem) : [];
}

export default normalizeBillItem;
