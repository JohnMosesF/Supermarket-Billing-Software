import { create } from 'zustand';
import toast from 'react-hot-toast';

export function createBillingStore(windowId) {
  return create((set, get) => ({
    windowId,
    invoiceNo: null,
    cart: [],
    discount: 0,
    customerName: '',
    customerMobile: '',
    paymentMethod: 'Cash',

    setInvoiceNo: (invoiceNo) => set({ invoiceNo }),
    setCustomerName: (customerName) => set({ customerName }),
    setCustomerMobile: (customerMobile) => set({ customerMobile }),
    setDiscount: (discount) => set({ discount }),
    setPaymentMethod: (paymentMethod) => set({ paymentMethod }),

    addProductToCart: (product, quantity = 1) =>
      set((state) => {
        if ((product.stock || 0) <= 0) {
          toast.error(`${product.name || product.productName} is out of stock`);
          return state;
        }

        const qtyToAdd = Math.max(1, Number(quantity) || 1);

        const normalizedProduct = {
          _id: product._id,
          name: product.name || product.productName,
          productName: product.productName || product.name,
          sku: product.sku,
          barcode: product.barcode,
          sellingPrice: product.sellingPrice,
          taxRate: product.taxRate || 0,
          stock: product.stock || 0,
        };

        // Merge only when same product AND same selling price
        const existingIndex = state.cart.findIndex((item) =>
          item._id === normalizedProduct._id && Number(item.sellingPrice || item.price || 0) === Number(normalizedProduct.sellingPrice || 0)
        );
        if (existingIndex >= 0) {
          return {
            cart: state.cart.map((item, idx) =>
              idx === existingIndex
                ? {
                    ...item,
                    quantity: Math.min(item.quantity + qtyToAdd, normalizedProduct.stock),
                  }
                : item
            ),
          };
        }

        return {
          cart: [...state.cart, { ...normalizedProduct, quantity: Math.min(qtyToAdd, normalizedProduct.stock) }],
        };
      }),

    changeQty: (productId, delta) =>
      set((state) => ({
        cart: state.cart.map((item) =>
          item._id === productId
            ? {
                ...item,
                quantity: Math.max(1, Math.min(item.stock, item.quantity + delta)),
              }
            : item
        ),
      })),

    removeItem: (productId) =>
      set((state) => ({
        cart: state.cart.filter((item) => item._id !== productId),
      })),

    clearCart: () =>
      set({
        cart: [],
        discount: 0,
        customerName: '',
        customerMobile: '',
        paymentMethod: 'Cash',
      }),
  }));
}
