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
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [categoryName, setCategoryName] = useState('');
  const { register, handleSubmit, reset } = useForm();
// --- Load Products & Categories ---
  async function load() {
    try {
      const [productRes, categoryRes] = await Promise.all([
        api.get('/products', {
          params: {
            search,
            limit: 100
          }
        }),
        api.get('/categories')
      ]);

      setProducts(productRes.data.products || []);
      setCategories(categoryRes.data.categories || []);

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

        allowDecimalQty: !!values.allowDecimalQty,

        localName: values.localName || '',
        companyName: values.companyName || '',
        hsnCode: values.hsnCode || '',
        unit: values.unit || 'pcs'
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
        allowDecimalQty: false
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

      allowDecimalQty: product.allowDecimalQty
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
        AllowDecimalQty: product.allowDecimalQty ? 'Yes' : 'No'
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
      HSNCode: '',
      AllowDecimalQty: 'No'
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
          const purchasePrice = Number(row.PurchasePrice || 0);
          const sellingPrice = Number(row.SellingPrice || 0);

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
            mrp: Number(row.MRP || 0),
            sellingPrice,
            wholesalePrice: Number(row.WholesalePrice || 0),
            purchasePrice,
            openingStock: Number(row.OpeningStock || 0),
            stock: Number(row.CurrentStock || row.OpeningStock || 0),
            lowStockThreshold: Number(row.LowStockThreshold || 5),
            companyName: row.CompanyName || '',
            unit: row.Unit || 'pcs',
            taxRate: Number(row.GST || 0),
            discount: Number(row.Discount || 0),
            hsnCode: row.HSNCode || '',
            allowDecimalQty:
              String(row.AllowDecimalQty)
                .toLowerCase() === 'yes'
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
            existing = products.find(
              p =>
                p.sku?.trim().toUpperCase() === sku
            );
          }
          if (!existing && excelProductId > 0) {
            existing = products.find(
              p => p.productId === excelProductId
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

          <div className="grid grid-cols-2 gap-3">
            <input className="input" type="number" step="0.01" placeholder="MRP" {...register('mrp')} />
            <input className="input" type="number" step="0.01" placeholder="Purchase price" {...register('purchasePrice', { required: true })} />
            <input className="input" type="number" step="0.01" placeholder="Selling price" {...register('sellingPrice', { required: true })} />
            <input className="input" type="number" step="0.01" placeholder="Wholesale price" {...register('wholesalePrice')} />
            <input className="input" type="number" step="0.01" placeholder="GST %" {...register('taxRate')} />
            
            <select className="input" {...register('unit')}>
              <option value="pcs">Pieces</option>
              <option value="kg">Kilogram</option>
              <option value="g">Gram</option>
              <option value="ltr">Litre</option>
              <option value="ml">Millilitre</option>
              <option value="box">Box</option>
              <option value="packet">Packet</option>
              <option value="dozen">Dozen</option>
            </select>

            <input className="input" type="number" placeholder="Stock" {...register('stock')} />
            <input className="input" type="number" placeholder="Low stock" {...register('lowStockThreshold')} />
            <input className="input" placeholder="Company Name" {...register('companyName')} />
            <input className="input" placeholder="HSN Code" {...register('hsnCode')} />
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                {...register('allowDecimalQty')}
              />
              Allow Decimal Quantity
            </label>
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
                    <th className="table-th">Decimal Qty</th>
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

                      <td className="table-td text-center">
                        {product.allowDecimalQty ? 'Yes' : 'No'}
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
