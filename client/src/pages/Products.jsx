import { Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { api } from '../api/http.js';
import { EmptyState } from '../components/EmptyState.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { currency } from '../utils/format.js';

export function Products() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [categoryName, setCategoryName] = useState('');
  const { register, handleSubmit, reset } = useForm();

  async function load() {
    const [productRes, categoryRes] = await Promise.all([
      api.get('/products', { params: { search, limit: 100 } }),
      api.get('/categories')
    ]);
    setProducts(productRes.data.products);
    setCategories(categoryRes.data.categories);
  }

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [search]);

  async function save(values) {
    const payload = {
      ...values,
      category: values.category || undefined,
      purchasePrice: Number(values.purchasePrice),
      sellingPrice: Number(values.sellingPrice),
      stock: Number(values.stock || 0),
      lowStockThreshold: Number(values.lowStockThreshold || 5),
      taxRate: Number(values.taxRate || 0)
    };

    if (editing) {
      await api.patch(`/products/${editing._id}`, payload);
      toast.success('Product updated');
    } else {
      await api.post('/products', payload);
      toast.success('Product added');
    }
    reset({});
    setEditing(null);
    load();
  }

  function edit(product) {
    setEditing(product);
    reset({
      name: product.name,
      sku: product.sku,
      category: product.category?._id,
      purchasePrice: product.purchasePrice,
      sellingPrice: product.sellingPrice,
      taxRate: product.taxRate,
      stock: product.stock,
      lowStockThreshold: product.lowStockThreshold,
      unit: product.unit
    });
  }

  async function remove(product) {
    if (!confirm(`Delete ${product.name}?`)) return;
    await api.delete(`/products/${product._id}`);
    toast.success('Product deleted');
    load();
  }

  async function addCategory() {
    if (!categoryName.trim()) return;
    await api.post('/categories', { name: categoryName.trim() });
    toast.success('Category added');
    setCategoryName('');
    load();
  }

  return (
    <div>
      <PageHeader title="Products" description="Manage product catalog, prices, GST, images, and stock levels." />
      <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
        <form onSubmit={handleSubmit(save)} className="panel space-y-3 p-5">
          <h2 className="font-semibold">{editing ? 'Edit product' : 'Add product'}</h2>
          <input className="input" placeholder="Product name" {...register('name', { required: true })} />
          <input className="input" placeholder="SKU auto generated if blank" {...register('sku')} />
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <select className="input" {...register('category')}>
              <option value="">No category</option>
              {categories.map((category) => <option key={category._id} value={category._id}>{category.name}</option>)}
            </select>
            <button type="button" className="btn-muted" onClick={addCategory}>Add</button>
          </div>
          <input className="input" placeholder="New category name" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <input className="input" type="number" step="0.01" placeholder="Purchase price" {...register('purchasePrice', { required: true })} />
            <input className="input" type="number" step="0.01" placeholder="Selling price" {...register('sellingPrice', { required: true })} />
            <input className="input" type="number" step="0.01" placeholder="GST %" {...register('taxRate')} />
            <input className="input" placeholder="Unit" {...register('unit')} />
            <input className="input" type="number" placeholder="Stock" {...register('stock')} />
            <input className="input" type="number" placeholder="Low stock" {...register('lowStockThreshold')} />
          </div>
          <div className="flex gap-2">
            <button className="btn-primary flex-1"><Plus size={17} />{editing ? 'Update' : 'Add'}</button>
            {editing ? <button type="button" className="btn-muted" onClick={() => { setEditing(null); reset({}); }}>Cancel</button> : null}
          </div>
        </form>

        <div className="panel overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-100 p-4 dark:border-slate-800">
            <Search size={18} className="text-slate-400" />
            <input className="w-full bg-transparent text-sm outline-none" placeholder="Search product, SKU, or barcode" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          {products.length ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="table-th">Product</th>
                    <th className="table-th">Category</th>
                    <th className="table-th">Stock</th>
                    <th className="table-th">Price</th>
                    <th className="table-th"></th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr key={product._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                      <td className="table-td">
                        <button className="text-left font-semibold text-leaf" onClick={() => edit(product)}>{product.name}</button>
                        <p className="text-xs text-slate-500">{product.sku}</p>
                      </td>
                      <td className="table-td">{product.category?.name || '-'}</td>
                      <td className="table-td">
                        <span className={product.stock <= product.lowStockThreshold ? 'font-semibold text-red-600' : ''}>{product.stock}</span>
                      </td>
                      <td className="table-td">{currency(product.sellingPrice)}</td>
                      <td className="table-td text-right">
                        <button className="btn-muted h-9 w-9 p-0" onClick={() => remove(product)} title="Delete"><Trash2 size={16} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="p-5"><EmptyState /></div>}
        </div>
      </div>
    </div>
  );
}
