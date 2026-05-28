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

    addProductToCart: (product) =>
      set((state) => {
        if ((product.stock || 0) <= 0) {
          toast.error(`${product.name || product.productName} is out of stock`);
          return state;
        }

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

        const existing = state.cart.find((item) => item._id === normalizedProduct._id);
        if (existing) {
          return {
            cart: state.cart.map((item) =>
              item._id === normalizedProduct._id
                ? {
                    ...item,
                    quantity: Math.min(item.quantity + 1, normalizedProduct.stock),
                  }
                : item
            ),
          };
        }

        return {
          cart: [...state.cart, { ...normalizedProduct, quantity: 1 }],
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
