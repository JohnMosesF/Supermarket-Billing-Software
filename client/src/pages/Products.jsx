import { Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { api } from '../api/http.js';
import { EmptyState } from '../components/EmptyState.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { currency } from '../utils/format.js';
import * as XLSX from 'xlsx';

export function Products() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [units, setUnits] = useState([]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [categoryName, setCategoryName] = useState('');
  const [unitForm, setUnitForm] = useState({ name: '', allowDecimal: false, id: null });
  const { register, handleSubmit, reset } = useForm();
  const decimal = (value, fallback = 0) => {
    if (value === null || value === undefined || value === '') return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
// --- Load Products & Categories ---
  async function load() {
    try {
      const [productRes, categoryRes, unitRes] = await Promise.all([
        api.get('/products', {
          params: {
            search,
            limit: 5000
          }
        }),
        api.get('/categories'),
        api.get('/units')
      ]);

      setProducts(productRes.data.products || []);
      setCategories(categoryRes.data.categories || []);
      setUnits(unitRes.data.units || []);

    } catch (error) {
      console.error('LOAD ERROR:', error);
      toast.error('Failed to load products');
    }
  }

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [search]);
// --- Add/Edit Product ---
  async function save(values) {
    try {
      console.log('Saving Product:', values);

      const payload = {
        ...values,

        category: values.category || undefined,

        purchasePrice: Number(values.purchasePrice || 0),
        sellingPrice: Number(values.sellingPrice || 0),
        wholesalePrice: Number(values.wholesalePrice || 0),
        mrp: Number(values.mrp || 0),

        stock: Number(values.stock || 0),
        openingStock: Number(values.openingStock || values.stock || 0),

        lowStockThreshold: Number(values.lowStockThreshold || 5),

        taxRate: Number(values.taxRate || 0),
        discount: Number(values.discount || 0),

        localName: values.localName || '',
        companyName: values.companyName || '',
        hsnCode: values.hsnCode || '',
        unit: values.unit || 'pcs',
        productId: Number(values.productId || 0),
      };

      if (editing) {
        await api.patch(`/products/${editing._id}`, payload);
        toast.success('Product updated');
      } else {
        await api.post('/products', payload);
        toast.success('Product added');
      }

      reset({
        name: '',
        localName: '',
        sku: '',
        category: '',
        mrp: '',
        purchasePrice: '',
        sellingPrice: '',
        wholesalePrice: '',
        stock: '',
        openingStock: '',
        lowStockThreshold: 5,
        taxRate: '',
        discount: '',
        companyName: '',
        hsnCode: '',
        unit: 'pcs',
      });

      setEditing(null);

      await load();

    } catch (error) {
      console.error('PRODUCT SAVE ERROR:', error);
      toast.error(error?.response?.data?.message || error.message);
    }
  }
// --- Edit Product ---
  function edit(product) {
  setEditing(product);

  reset({
      productId: product.productId,
      name: product.name,
      localName: product.localName,
      sku: product.sku,

      category: product.category?._id,

      mrp: product.mrp,
      purchasePrice: product.purchasePrice,
      sellingPrice: product.sellingPrice,
      wholesalePrice: product.wholesalePrice,

      stock: product.stock,
      openingStock: product.openingStock,

      lowStockThreshold: product.lowStockThreshold,

      taxRate: product.taxRate,
      discount: product.discount,

      companyName: product.companyName,
      hsnCode: product.hsnCode,

      unit: product.unit,

    });
  }
// --- Delete Product ---
  async function remove(product) {
    if (!confirm(`Delete ${product.name}?`)) return;
    await api.delete(`/products/${product._id}`);
    toast.success('Product deleted');
    load();
  }
// --- Categories ---
  async function addCategory() {
    if (!categoryName.trim()) return;
    await api.post('/categories', { name: categoryName.trim() });
    toast.success('Category added');
    setCategoryName('');
    load();
  }
// --- Units ---
  async function saveUnit() {
    const name = unitForm.name.trim().toLowerCase();
    if (!name) return;
    const payload = { name, allowDecimal: Boolean(unitForm.allowDecimal) };
    if (unitForm.id) {
      await api.patch(`/units/${unitForm.id}`, payload);
      toast.success('Unit updated');
    } else {
      await api.post('/units', payload);
      toast.success('Unit added');
    }
    setUnitForm({ name: '', allowDecimal: false, id: null });
    load();
  }

  async function removeUnit(unit) {
    if (!confirm(`Delete unit ${unit.name}?`)) return;
    await api.delete(`/units/${unit._id}`);
    toast.success('Unit deleted');
    load();
  }
// --- Excel Import/Export ---
  function exportProducts() {
    const worksheet = XLSX.utils.json_to_sheet(
      products.map(product => ({
        ProductID: product.productId,
        SKU: product.sku,
        Name: product.name,
        LocalName: product.localName,
        MRP: product.mrp,
        SellingPrice: product.sellingPrice,
        WholesalePrice: product.wholesalePrice,
        OpeningStock: product.openingStock,
        CurrentStock: product.stock,
        PurchasePrice: product.purchasePrice,
        LowStockThreshold: product.lowStockThreshold,
        CompanyName: product.companyName,
        Unit: product.unit,
        Category: product.category?.name,
        GST: product.taxRate,
        Discount: product.discount,
        HSNCode: product.hsnCode,
      }))
    );

    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      'Products'
    );

    XLSX.writeFile(
      workbook,
      'products.xlsx'
    );
  }
// --- Download Excel Template ---
  function downloadTemplate() {
    const worksheet = XLSX.utils.json_to_sheet([
    {
      ProductID: '',
      SKU: '',
      Name: '',
      LocalName: '',
      MRP: '',
      SellingPrice: '',
      WholesalePrice: '',
      OpeningStock: '',
      CurrentStock: '',
      PurchasePrice: '',
      LowStockThreshold: '',
      CompanyName: '',
      Unit: 'pcs',
      Category: '',
      GST: '',
      Discount: '',
      HSNCode: ''
    }
  ]);

    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      'Template'
    );

    XLSX.writeFile(
      workbook,
      'product_template.xlsx'
    );
  }
// --- Handle Excel Import ---
  async function handleImport(event) {
    try {
      const file = event.target.files[0];

      if (!file) return;

      const data = await file.arrayBuffer();

      const workbook = XLSX.read(data);

      const sheet =
        workbook.Sheets[
          workbook.SheetNames[0]
        ];

      const rows =
        XLSX.utils.sheet_to_json(sheet);

      console.log(rows);

      toast.success(
        `${rows.length} products loaded`
      );

      // next step:
      // send rows to backend bulk import API
      console.log("Imported rows:", rows);

      let successCount = 0;
      let failureCount = 0;

      const allProductsRes = await api.get('/products', {
        params: { limit: 5000 }
      });

      const allProducts =
        allProductsRes.data.products || [];
      for (const row of rows) {
        try {
          // Validate required fields
          const name = row.Name?.trim();
          const skuFromExcel = row.SKU?.trim();
          const sku = (skuFromExcel || '').toUpperCase();
          const excelProductId = Number(
            row.ProductID ||
            row['Product ID'] ||
            row.ProductId ||
            0
          );
          const purchasePrice = decimal(row.PurchasePrice);
          const sellingPrice = decimal(row.SellingPrice);

          // Skip if missing product name
          if (!name) {
            console.warn('Skipping row: Missing product name', row);
            continue;
          }
          if (purchasePrice <= 0) {
            console.warn('Skipping row: Invalid purchase price', row);
            failureCount++;
            toast.error(`Invalid purchase price for "${name}"`);
            continue;
          }
          if (sellingPrice <= 0) {
            console.warn('Skipping row: Invalid selling price', row);
            failureCount++;
            toast.error(`Invalid selling price for "${name}"`);
            continue;
          }

          // Build payload with all fields
          const payload = {
            name,
            localName: row.LocalName?.trim() || '',
            mrp: decimal(row.MRP),
            sellingPrice,
            wholesalePrice: decimal(row.WholesalePrice),
            purchasePrice,
            openingStock: Number(row.OpeningStock || 0),
            stock: Number(row.CurrentStock || row.OpeningStock || 0),
            lowStockThreshold: Number(row.LowStockThreshold || 5),
            companyName: row.CompanyName || '',
            unit: String(row.Unit || 'pcs').toLowerCase(),
            taxRate: Number(row.GST || 0),
            discount: Number(row.Discount || 0),
            hsnCode: row.HSNCode || ''
          };

          // Only include SKU if provided in Excel (let server auto-generate if missing)
          if (skuFromExcel) {
            payload.sku = sku;
          }

          // Only include productId if provided in Excel
          if (excelProductId > 0) {
            payload.productId = excelProductId;
          }

          // Find and assign category
          if (row.Category) {
            const existingCategory = categories.find(
              c =>
                c.name.toLowerCase() ===
                row.Category.toLowerCase()
            );
            if (existingCategory) {
              payload.category = existingCategory._id;
            }
          }

          // Check if product already exists by SKU or ProductID
          let existing = null;
          if (skuFromExcel) {
            existing = allProducts.find(
              p =>
                p.sku?.trim().toUpperCase() === sku
            );
          }
          if (!existing && excelProductId > 0) {
            existing = allProducts.find(
              p => Number(p.productId) === Number(excelProductId)
            );
          }

          if (existing) {
            console.log('Updating product:', name);
            await api.patch(
              `/products/${existing._id}`,
              payload
            );
            console.log('✓ Updated:', name);
            successCount++;
          } else {
            console.log('Creating new product:', name, skuFromExcel ? `with SKU: ${sku}` : '(SKU will be auto-generated)');
            await api.post(
              '/products',
              payload
            );
            console.log('✓ Created:', name);
            successCount++;
          }
        } catch (error) {
          failureCount++;
          const productName = row.Name?.trim() || 'Unknown';
          console.error(`✗ Error importing "${productName}":`, error?.response?.data || error.message);
          toast.error(`✗ "${productName}": ${error?.response?.data?.message || error.message}`);
        }
      }

      await load();
      event.target.value = '';

      toast.success(
        `Imported: ${successCount} products${failureCount > 0 ? `, ${failureCount} failed` : ''}`
      );

    } catch (error) {
      console.error(error);
      toast.error('Import failed');
    }
  }

  return (
    <div>
    
      <PageHeader title="Products" description="Manage product catalog, prices, GST, images, and stock levels." />
      <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
        <form onSubmit={handleSubmit(save)} className="panel space-y-3 p-5">
          <h2 className="font-semibold">{editing ? 'Edit product' : 'Add product'}</h2>
          
          
          <input className="input" type="number" placeholder="Product ID" {...register('productId')} />
          <input className="input" placeholder="Product name" {...register('name', { required: true })} />
          <input className="input" placeholder="Local Language Name" {...register('localName')} />
          <input className="input" placeholder="SKU auto generated if blank" {...register('sku')} />
          
          <select className="input" {...register('category')}>
            <option value="">No category</option>
            {categories.map((category) => <option key={category._id} value={category._id}>{category.name}</option>)}
          </select>
            
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input className="input" placeholder="New category name" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} />
            <button type="button" className="btn-muted" onClick={addCategory}>Add</button>
          </div>

          <div className="panel space-y-2 p-3 shadow-none">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">Manage Units</span>
              <button type="button" className="btn-muted py-1.5" onClick={saveUnit}>
                {unitForm.id ? 'Update' : 'Add'}
              </button>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <input
                className="input"
                placeholder="Unit name"
                value={unitForm.name}
                onChange={(event) => setUnitForm((current) => ({ ...current, name: event.target.value }))}
              />
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={unitForm.allowDecimal}
                  onChange={(event) => setUnitForm((current) => ({ ...current, allowDecimal: event.target.checked }))}
                />
                Decimal
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              {units.map((unit) => (
                <button
                  type="button"
                  key={unit._id}
                  className="rounded-md border border-slate-200 px-2 py-1 text-xs dark:border-slate-700"
                  onClick={() => setUnitForm({ id: unit._id, name: unit.name, allowDecimal: unit.allowDecimal })}
                  onDoubleClick={() => removeUnit(unit)}
                  title="Click to edit, double click to delete"
                >
                  {unit.name} {unit.allowDecimal ? '(decimal)' : '(whole)'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <input className="input" type="number" step="0.01" placeholder="MRP" {...register('mrp')} />
            <input className="input" type="number" step="0.01" placeholder="Purchase price" {...register('purchasePrice', { required: true })} />
            <input className="input" type="number" step="0.01" placeholder="Selling price" {...register('sellingPrice', { required: true })} />
            <input className="input" type="number" step="0.01" placeholder="Wholesale price" {...register('wholesalePrice')} />
            <input className="input" type="number" step="0.01" placeholder="GST %" {...register('taxRate')} />
            
            <select className="input" {...register('unit')}>
              {units.map((unit) => (
                <option key={unit._id} value={unit.name}>
                  {unit.name} ({unit.allowDecimal ? 'decimal' : 'whole'})
                </option>
              ))}
            </select>

            <input className="input" type="number" placeholder="Stock" {...register('stock')} />
            <input className="input" type="number" placeholder="Low stock" {...register('lowStockThreshold')} />
            <input className="input" placeholder="Company Name" {...register('companyName')} />
            <input className="input" placeholder="HSN Code" {...register('hsnCode')} />
          </div>
          
          <div className="flex gap-2">
            <button className="btn-primary flex-1"><Plus size={17} />{editing ? 'Update' : 'Add'}</button>
            {editing ? <button type="button" className="btn-muted" onClick={() => { setEditing(null); reset({}); }}>Cancel</button> : null}
          </div>
        </form>

        <div className="panel overflow-hidden">
          <div className="flex gap-2 p-4 border-b">
            <button
              type="button"
              className="btn-primary"
              onClick={exportProducts}
            >
              Export Excel
            </button>

            <button
              type="button"
              className="btn-muted"
              onClick={downloadTemplate}
            >
              Download Template
            </button>

            <label className="btn-muted cursor-pointer">
              Import Excel
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleImport}
              />
            </label>
          </div>
          <div className="flex items-center gap-2 border-b border-slate-100 p-4 dark:border-slate-800">
            <Search size={18} className="text-slate-400" />
            <input className="w-full bg-transparent text-sm outline-none" placeholder="Search product, SKU, or barcode" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          {products.length ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="table-th">PID</th>
                    <th className="table-th">SKU</th>
                    <th className="table-th">Name</th>
                    <th className="table-th">Local Name</th>
                    <th className="table-th">Company</th>
                    <th className="table-th">Category</th>
                    <th className="table-th">Unit</th>
                    <th className="table-th">MRP</th>
                    <th className="table-th">Purchase</th>
                    <th className="table-th">Wholesale</th>
                    <th className="table-th">Sale</th>
                    <th className="table-th">Stock</th>
                    <th className="table-th">Low Stock</th>
                    <th className="table-th">GST</th>
                    <th className="table-th">Discount</th>
                    <th className="table-th">HSN</th>
                    <th className="table-th"></th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr
                      key={product._id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    >
                      <td className="table-td">{product.productId}</td>

                      <td className="table-td">
                        {product.sku}
                      </td>

                      <td className="table-td">
                        <button
                          className="text-left font-semibold text-leaf"
                          onClick={() => edit(product)}
                        >
                          {product.name}
                        </button>
                      </td>

                      <td className="table-td">
                        {product.localName || '-'}
                      </td>

                      <td className="table-td">
                        {product.companyName || '-'}
                      </td>

                      <td className="table-td">
                        {product.category?.name || '-'}
                      </td>

                      <td className="table-td">
                        {product.unit || 'pcs'}
                      </td>

                      <td className="table-td">
                        {currency(product.mrp || 0)}
                      </td>

                      <td className="table-td">
                        {currency(product.purchasePrice || 0)}
                      </td>

                      <td className="table-td">
                        {currency(product.wholesalePrice || 0)}
                      </td>

                      <td className="table-td">
                        {currency(product.sellingPrice || 0)}
                      </td>

                      <td className="table-td">
                        <span
                          className={
                            product.stock <= product.lowStockThreshold
                              ? 'font-semibold text-red-600'
                              : ''
                          }
                        >
                          {product.stock}
                        </span>
                      </td>

                      <td className="table-td">
                        {product.lowStockThreshold}
                      </td>

                      <td className="table-td">
                        {product.taxRate || 0}%
                      </td>

                      <td className="table-td">
                        {product.discount || 0}%
                      </td>

                      <td className="table-td">
                        {product.hsnCode || '-'}
                      </td>

                      <td className="table-td text-right">
                        <button
                          className="btn-muted h-9 w-9 p-0"
                          onClick={() => remove(product)}
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
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
