import React, { useState, useEffect } from 'react';
import { 
  Plus, Search, Edit2, Trash2, Heart, Award, Eye, FileImage, Loader2 
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../ui/dialog';
import { webApi } from '../../services/api';
import { AppImage } from '../AppImage';
import { toast } from 'sonner';

interface Product {
  id: string;
  name: string;
  category: 'panels' | 'inverters' | 'batteries' | 'mounting';
  subType: string;
  wattage?: string;
  price: number;
  warranty?: string;
  specs?: string; // JSON string
  inStock: boolean;
  isFeatured: boolean;
  imageUrl?: string;
}

const ProductsManager: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Dialog & Form states
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form Field States
  const [name, setName] = useState('');
  const [category, setCategory] = useState<'panels' | 'inverters' | 'batteries' | 'mounting'>('panels');
  const [subType, setSubType] = useState('');
  const [wattage, setWattage] = useState('');
  const [price, setPrice] = useState<number>(0);
  const [warranty, setWarranty] = useState('');
  const [specs, setSpecs] = useState(''); // Raw input specs
  const [inStock, setInStock] = useState(true);
  const [isFeatured, setIsFeatured] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const fetchProducts = async () => {
    setIsLoading(true);
    try {
      const resp = await webApi.getProducts(
        categoryFilter !== 'all' ? { category: categoryFilter } : undefined
      );
      const data = resp.data.data?.products || resp.data.data || resp.data;
      setProducts(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast.error('Failed to fetch products');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [categoryFilter]);

  const openCreateDialog = () => {
    setEditingProduct(null);
    setName('');
    setCategory('panels');
    setSubType('');
    setWattage('');
    setPrice(0);
    setWarranty('');
    setSpecs(JSON.stringify({ Efficiency: '21.5%', Cells: '144' }, null, 2));
    setInStock(true);
    setIsFeatured(false);
    setSelectedFile(null);
    setIsDialogOpen(true);
  };

  const openEditDialog = (prod: Product) => {
    setEditingProduct(prod);
    setName(prod.name || '');
    setCategory(prod.category || 'panels');
    setSubType(prod.subType || '');
    setWattage(prod.wattage || '');
    setPrice(prod.price || 0);
    setWarranty(prod.warranty || '');
    try { setSpecs(prod.specs ? JSON.stringify(JSON.parse(prod.specs), null, 2) : ''); } catch { setSpecs(prod.specs || ''); }
    setInStock(!!prod.inStock);
    setIsFeatured(!!prod.isFeatured);
    setSelectedFile(null);
    setIsDialogOpen(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Product Name is required');
      return;
    }

    // Validate if specs is valid JSON if filled
    let formattedSpecs = '';
    if (specs.trim()) {
      try {
        JSON.parse(specs);
        formattedSpecs = specs;
      } catch (err) {
        toast.error('Specifications must be valid JSON object');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('name', name);
      formData.append('category', category);
      formData.append('subType', subType);
      formData.append('wattage', wattage);
      formData.append('price', String(price));
      formData.append('warranty', warranty);
      formData.append('specs', formattedSpecs);
      formData.append('inStock', String(inStock));
      formData.append('isFeatured', String(isFeatured));

      if (selectedFile) {
        formData.append('image', selectedFile);
      }

      if (editingProduct) {
        await webApi.updateProduct(editingProduct.id, formData);
        toast.success('Product updated successfully!');
      } else {
        await webApi.createProduct(formData);
        toast.success('Product created successfully!');
      }

      setIsDialogOpen(false);
      fetchProducts();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error saving product');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this product?')) return;
    try {
      await webApi.deleteProduct(id);
      toast.success('Product deleted successfully!');
      fetchProducts();
    } catch (err) {
      toast.error('Failed to delete product');
    }
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.subType.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Card className="border-stone-200 shadow-sm">
      <CardHeader className="p-4 border-b border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <CardTitle className="text-lg font-bold">Web Products Catalog</CardTitle>
          <CardDescription>Publish panels, inverters, and accessories on the public portal</CardDescription>
        </div>
        <Button onClick={openCreateDialog} className="bg-orange-600 hover:bg-orange-700 text-white gap-2">
          <Plus size={16} /> Add Product
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
            <Input 
              placeholder="Search products by name or type..." 
              className="pl-10 h-10 border-stone-200"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-stone-500 font-medium">Category:</span>
            <select
              className="h-10 border border-stone-200 rounded-md px-3 text-sm bg-card"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="all">All Categories</option>
              <option value="panels">Panels</option>
              <option value="inverters">Inverters</option>
              <option value="batteries">Batteries</option>
              <option value="mounting">Mounting & Rails</option>
            </select>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="bg-stone-50">
              <TableHead className="w-20">Preview</TableHead>
              <TableHead>Product Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Specifications</TableHead>
              <TableHead>Price (INR)</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-48 text-center">
                  <div className="flex flex-col items-center justify-center text-stone-400">
                    <Loader2 size={32} className="animate-spin mb-2" />
                    <span>Loading products...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredProducts.length > 0 ? (
              filteredProducts.map((prod) => (
                <TableRow key={prod.id}>
                  <TableCell>
                    {prod.imageUrl ? (
                      <AppImage 
                        src={prod.imageUrl} 
                        alt={prod.name} 
                        className="w-12 h-10 object-cover rounded border border-stone-100"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-12 h-10 bg-stone-100 rounded flex items-center justify-center text-stone-400">
                        <FileImage size={16} />
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div>
                      <h4 className="font-semibold text-stone-900">{prod.name}</h4>
                      <p className="text-xs text-stone-500 font-medium">{prod.subType}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">{prod.category}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="text-xs text-stone-600">
                      {prod.wattage && <p><span className="font-semibold text-stone-500">Wattage:</span> {prod.wattage}</p>}
                      {prod.warranty && <p><span className="font-semibold text-stone-500">Warranty:</span> {prod.warranty}</p>}
                    </div>
                  </TableCell>
                  <TableCell className="font-bold text-stone-950">
                    ₹{prod.price?.toLocaleString() || '0'}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1.5">
                      {prod.inStock ? (
                        <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-none w-fit">In Stock</Badge>
                      ) : (
                        <Badge variant="destructive" className="w-fit">Out of Stock</Badge>
                      )}
                      {prod.isFeatured && (
                        <Badge className="bg-orange-100 text-orange-700 border-none w-fit">Featured</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => openEditDialog(prod)} className="h-8 w-8 text-stone-600">
                        <Edit2 size={14} />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(prod.id)} className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50">
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-stone-400">
                  No products found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingProduct ? 'Edit Catalog Product' : 'Add Catalog Product'}</DialogTitle>
            <DialogDescription>
              This publishes the product specifications and indicative pricing onto the web storefront.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-stone-700">Product Name *</label>
              <Input 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                placeholder="e.g. LONGi Hi-MO 6 Solar Panel" 
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-stone-700">Category *</label>
                <select
                  className="w-full h-10 border border-stone-200 rounded-md px-3 text-sm bg-card capitalize"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as any)}
                >
                  <option value="panels">panels</option>
                  <option value="inverters">inverters</option>
                  <option value="batteries">batteries</option>
                  <option value="mounting">mounting & raw materials</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-stone-700">Sub Type / Material *</label>
                <Input 
                  value={subType} 
                  onChange={(e) => setSubType(e.target.value)} 
                  placeholder="e.g. Monocrystalline, Hybrid" 
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-stone-700">Price (INR) *</label>
                <Input 
                  type="number"
                  value={price} 
                  onChange={(e) => setPrice(Number(e.target.value))} 
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-stone-700">Wattage</label>
                <Input 
                  value={wattage} 
                  onChange={(e) => setWattage(e.target.value)} 
                  placeholder="e.g. 550W" 
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-stone-700">Warranty</label>
                <Input 
                  value={warranty} 
                  onChange={(e) => setWarranty(e.target.value)} 
                  placeholder="e.g. 25 Years" 
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold text-stone-700">Technical Specifications (JSON format)</label>
                <span className="text-[10px] text-stone-400 font-mono">Valid JSON Required</span>
              </div>
              <textarea
                className="w-full p-2 border border-stone-200 rounded-md text-sm font-mono h-24 bg-stone-50"
                value={specs}
                onChange={(e) => setSpecs(e.target.value)}
                placeholder='{ "Efficiency": "21.5%", "Cells": "144" }'
              />
            </div>

            <div className="grid grid-cols-2 gap-4 border border-stone-100 p-2 text-xs bg-stone-50 rounded-md">
              <div className="flex items-center gap-2">
                <input 
                  type="checkbox" 
                  id="inStockCheck"
                  checked={inStock} 
                  onChange={(e) => setInStock(e.target.checked)} 
                  className="w-4 h-4 accent-orange-600 cursor-pointer"
                />
                <label htmlFor="inStockCheck" className="font-semibold text-stone-700 cursor-pointer">Available (In Stock)</label>
              </div>

              <div className="flex items-center gap-2">
                <input 
                  type="checkbox" 
                  id="featuredCheck"
                  checked={isFeatured} 
                  onChange={(e) => setIsFeatured(e.target.checked)} 
                  className="w-4 h-4 accent-orange-600 cursor-pointer"
                />
                <label htmlFor="featuredCheck" className="font-semibold text-stone-700 cursor-pointer">Featured Product</label>
              </div>
            </div>

            <div className="space-y-1 border border-dashed border-stone-200 p-3 rounded-md flex flex-col items-center justify-center text-center">
              <FileImage className="text-stone-400 mb-1" size={20} />
              <span className="text-xs font-medium text-stone-600">Product Image</span>
              <input 
                type="file" 
                accept="image/*" 
                onChange={handleFileChange} 
                className="text-xs text-stone-600 mt-1"
              />
              {editingProduct && !selectedFile && editingProduct.imageUrl && (
                <p className="text-[10px] text-orange-600 font-medium mt-1">Keeps current product image</p>
              )}
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" className="bg-orange-600 hover:bg-orange-700 text-white" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin mr-2" /> Saving...
                  </>
                ) : (
                  'Save Product'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default ProductsManager;
