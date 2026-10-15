import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Search,
  Package,
  AlertTriangle,
  TrendingDown,
  History,
  Trash2,
  Loader2,
  ArrowDownRight,
  ArrowUpLeft,
  ArrowRightLeft,
  User,
  Clock
} from 'lucide-react';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { inventoryApi, leadsApi, branchesApi } from '../services/api';
import { InventoryItem } from '../types';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { useRegion } from '../contexts/RegionContext';
import { useSearchParams } from 'react-router-dom';

const Inventory: React.FC = () => {
  const { hasPermission } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setIsAddDialogOpen(true);
      searchParams.delete('new');
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [isStockInDialogOpen, setIsStockInDialogOpen] = useState(false);
  const [isStockOutDialogOpen, setIsStockOutDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [stockOutQty, setStockOutQty] = useState(0);
  const [stockOutPrice, setStockOutPrice] = useState(0);
  const [stockOutTotal, setStockOutTotal] = useState(0);
  // Confirm step: Remove dabane par pehle review, phir Confirm & Remove.
  const [stockOutReview, setStockOutReview] = useState<null | {
    quantity: number; unitPrice?: number; clientId: string; clientName: string; notes: string; branchId?: string;
  }>(null);
  const [stockOutSaving, setStockOutSaving] = useState(false);
  // Branch transfer: Central/branch se doosri branch ko units. Backend me
  // transfer endpoint nahi — stock-out + stock-in ka pair banta hai.
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [transferTo, setTransferTo] = useState('');
  const [transferQty, setTransferQty] = useState(0);
  const [transferReview, setTransferReview] = useState<null | { toBranchId: string; toName: string; qty: number }>(null);
  const [transferSaving, setTransferSaving] = useState(false);
  const [wonLeads, setWonLeads] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [isStockLogOpen, setIsStockLogOpen] = useState(false);
  const [movementsLoading, setMovementsLoading] = useState(false);
  // Server-side alerts (GET /inventory/alerts) — backend-confirmed critical
  // items; local lowStockItems calc stays as instant fallback.
  const [serverAlerts, setServerAlerts] = useState<any[]>([]);
  // Branches (branchId → region). Stock central hai jab tak item kisi
  // branch pe assign na ho; region filter = us region ki branches + central.
  const [branches, setBranches] = useState<any[]>([]);
  const { regions: allRegions, selectedRegion, selectedRegionName } = useRegion();

  const fetchInventory = async () => {
    setIsLoading(true);
    try {
      const response = await inventoryApi.getAll();
      const data = response.data.data?.items || response.data.data;
      setItems(Array.isArray(data) ? data : []);
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.message || 'Failed to fetch inventory';
      toast.error(msg);
      console.error('Inventory fetch error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!hasPermission('inventory', 'read')) {
      toast.error('Access denied');
      return;
    }
    fetchInventory();
    fetchMovements();
    // Best-effort server alerts; silent on failure (local calc covers it).
    inventoryApi.getAlerts()
      .then((r: any) => {
        const raw = r.data?.data?.alerts ?? r.data?.data?.items ?? r.data?.data ?? [];
        setServerAlerts(Array.isArray(raw) ? raw : []);
      })
      .catch(() => setServerAlerts([]));
    leadsApi.getWonLeads({ limit: 100 }).then(r => {
      const raw = r.data.data?.leads || r.data.data || [];
      setWonLeads(Array.isArray(raw) ? raw : []);
    }).catch(() => {});
    branchesApi.getAll().then(r => {
      const raw = r.data?.data?.branches ?? r.data?.data ?? [];
      setBranches(Array.isArray(raw) ? raw : []);
    }).catch(() => setBranches([]));
  }, []);

  const fetchMovements = async (itemId?: string) => {
    try {
      const params = itemId ? { itemId } : {};
      const r = await inventoryApi.getMovements(params);
      const data = Array.isArray(r.data.data) ? r.data.data : [];
      setMovements(data);
      const outMovements = data.filter((m: any) => m.type === 'STOCK_OUT');
      // quantity STOCK_OUT me negative aa sakti hai — display ke liye abs.
      const total = outMovements.reduce((s: number, m: any) => s + Math.abs(Number(m.quantity) || 0) * (Number(m.unitPrice) || 0), 0);
      setStockOutTotal(total);
    } catch { setMovements([]); }
  };

  // Region-wise STOCK_OUT usage — movement.regionId se (backend live).
  // Stock central hai jab tak branch assign na ho; bina-region rows Unknown.
  const regionUsage = useMemo(() => {
    const regionNameOf = (regionId: any): string => {
      if (!regionId) return 'Unknown';
      const hit = allRegions.find((r: any) => String(r.id || r._id) === String(regionId));
      return hit?.name || 'Unknown';
    };
    const groups = new Map<string, { key: string; name: string; moves: number; qty: number; value: number }>();
    movements.filter((m: any) => m.type === 'STOCK_OUT').forEach((m: any) => {
      const rid = m.regionId || m.region?.id || m.branch?.regionId;
      const key = rid ? String(rid) : 'unknown';
      const name = rid ? regionNameOf(rid) : (m.branchName ? `${m.branchName} (?)` : 'Unknown');
      const g = groups.get(key) || { key, name, moves: 0, qty: 0, value: 0 };
      const q = Math.abs(Number(m.quantity) || 0);
      g.moves += 1;
      g.qty += q;
      g.value += q * (Number(m.unitPrice) || 0);
      groups.set(key, g);
    });
    return [...groups.values()].sort((a, b) => b.value - a.value);
  }, [movements, allRegions]);

  // Item ka region = uski branch ka region. Bina-branch (central) stock
  // hamesha dikhta hai — region filter = us region ki branches + central.
  const itemRegionId = (item: any): string =>
    String(item?.branch?.regionId || item?.branch?.region?.id || item?.regionId || '');

  const branchRegionName = (branch: any): string => {
    const rid = branch?.regionId || branch?.region?.id;
    if (!rid) return 'No region';
    return branch?.region?.name || allRegions.find((r: any) => String(r.id || r._id) === String(rid))?.name || 'Region';
  };

  const filteredItems = items.filter(item => {
    // name/brand are API-supplied and not always populated — a bare
    // `.toLowerCase()` here white-screens the whole page.
    const matchesSearch = String(item.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||                         String(item.brand || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
    // Region select par SIRF us region ka stock (central excluded).
    const rid = itemRegionId(item);
    const matchesRegion = selectedRegion === 'all' || (rid && rid === String(selectedRegion));
    return matchesSearch && matchesCategory && matchesRegion;
  });

  // Region-scope: stats + log + usage sab selected region ke hisab se.
  const movementRegionId = (m: any): string =>
    String(m.regionId || m.region?.id || m.branch?.regionId || '');
  const scopedMovements = useMemo(
    () => selectedRegion === 'all'
      ? movements
      : movements.filter((m: any) => movementRegionId(m) === String(selectedRegion)),
    [movements, selectedRegion]
  );
  const scopedOutValue = useMemo(
    () => scopedMovements
      .filter((m: any) => m.type === 'STOCK_OUT')
      .reduce((s: number, m: any) => s + Math.abs(Number(m.quantity) || 0) * (Number(m.unitPrice) || 0), 0),
    [scopedMovements]
  );
  const scopedStockValue = useMemo(
    () => filteredItems.reduce((acc, item) => acc + ((item.currentStock || 0) * (item.pricePerUnit || 0)), 0),
    [filteredItems]
  );
  const scopedLowCount = useMemo(
    () => filteredItems.filter(item => Number(item.currentStock) < Number(item.minThreshold)).length,
    [filteredItems]
  );
  const scopedUsage = useMemo(
    () => selectedRegion === 'all' ? regionUsage : regionUsage.filter(g => g.key === String(selectedRegion)),
    [regionUsage, selectedRegion]
  );

  const handleAssignBranch = async (itemId: string, branchId: string) => {
    try {
      await inventoryApi.update(itemId, { branchId: branchId || null });
      toast.success(branchId ? 'Item branch assigned' : 'Item moved to central stock');
      fetchInventory();
    } catch (err: any) {
      const raw = err?.response?.data?.message || 'Failed to assign branch';
      toast.error(Array.isArray(raw) ? raw.join(', ') : raw);
    }
  };

  const lowStockItems = items.filter(item => Number(item.currentStock) < Number(item.minThreshold));
  // Same name (case-insensitive) appearing more than once = possible duplicate
  // (backend seed cleanup alag se ho raha hai; tab tak UI hint).
  const nameCounts = useMemo(() => {
    const m = new Map<string, number>();
    items.forEach((item) => {
      const k = String(item.name || '').trim().toLowerCase();
      if (k) m.set(k, (m.get(k) || 0) + 1);
    });
    return m;
  }, [items]);

  const handleAddStockItem = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const itemData = {
      name: formData.get('name') as string,
      category: formData.get('category') as string,
      brand: formData.get('brand') as string,
      unit: formData.get('unit') as string,
      currentStock: Number(formData.get('currentStock')),
      minThreshold: Number(formData.get('minThreshold')),
      pricePerUnit: Number(formData.get('pricePerUnit')),
    };
    const branchVal = formData.get('branchId') as string;
    const payload: any = { ...itemData };
    if (branchVal && branchVal !== 'central') payload.branchId = branchVal;
    if (!itemData.name?.trim()) { toast.error('Item name is required'); return; }
    if (!isFinite(itemData.currentStock) || itemData.currentStock < 0) { toast.error('Current stock must be 0 or more'); return; }
    if (!isFinite(itemData.minThreshold) || itemData.minThreshold < 0) { toast.error('Min threshold must be 0 or more'); return; }
    if (!isFinite(itemData.pricePerUnit) || itemData.pricePerUnit < 0) { toast.error('Price must be 0 or more'); return; }

    try {
      await inventoryApi.create(payload);
      fetchInventory();
      setIsAddDialogOpen(false);
      toast.success('Inventory item added successfully!');
    } catch (error) {
      toast.error('Failed to add item');
    }
  };

  // Step 1: validate + review dikhao. Step 2 (confirmStockOut): actual API call.
  const handleStockOut = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedItem || stockOutSaving) return;

    const formData = new FormData(e.currentTarget);
    const quantity = Number(formData.get('quantity'));

    if (quantity <= 0) {
      toast.error('Quantity must be positive');
      return;
    }
    if (quantity > (selectedItem.currentStock || 0)) {
      toast.error(`Cannot remove ${quantity} units. Only ${selectedItem.currentStock} in stock.`);
      return;
    }

    // `|| undefined` would turn a genuine 0 price into "not entered".
    const priceRaw = Number(formData.get('unitPrice'));
    if (formData.get('unitPrice') !== '' && (!isFinite(priceRaw) || priceRaw < 0)) {
      toast.error('Unit price must be 0 or more');
      return;
    }
    const unitPrice = formData.get('unitPrice') === '' || !isFinite(priceRaw) ? undefined : priceRaw;
    const clientId = (formData.get('clientId') as string) || '';
    const clientName = wonLeads.find(l => l.id === clientId)?.name || '';
    const notes = (formData.get('notes') as string) || '';
    // Item ki branch bhejo (na bhejo to backend item ka branch auto-lagata hai).
    const branchId = (selectedItem as any)?.branchId || (selectedItem as any)?.branch?.id || undefined;
    setStockOutReview({ quantity, unitPrice, clientId, clientName, notes, branchId });
  };

  const confirmStockOut = async () => {
    if (!selectedItem || !stockOutReview || stockOutSaving) return;
    setStockOutSaving(true);
    try {
      const { quantity, unitPrice, clientName, notes, branchId } = stockOutReview;
      const fullNotes = clientName ? `Used for: ${clientName}${notes ? ` | ${notes}` : ''}` : notes;
      await inventoryApi.stockOut(selectedItem.id, { quantity, unitPrice, notes: fullNotes, ...(branchId ? { branchId } : {}) });
      fetchInventory();
      fetchMovements();
      setIsStockOutDialogOpen(false);
      setSelectedItem(null);
      setStockOutQty(0);
      setStockOutPrice(0);
      setStockOutReview(null);
      toast.success('Stock removed successfully!');
    } catch (error: any) {
      const raw = error?.response?.data?.message || 'Failed to remove stock';
      toast.error(Array.isArray(raw) ? raw.join(', ') : raw);
    } finally {
      setStockOutSaving(false);
    }
  };

  const openTransfer = (item: any) => {
    setSelectedItem(item);
    setTransferTo('');
    setTransferQty(0);
    setTransferReview(null);
    setIsTransferOpen(true);
  };

  const branchNameOf = (branchId: string): string => {
    if (!branchId || branchId === 'central') return 'Central';
    return branches.find((b: any) => b.id === branchId)?.name || 'Branch';
  };

  // Step 1: validate + review (Are you sure?) screen.
  const handleTransferReview = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedItem || transferSaving) return;
    const fromId = (selectedItem as any)?.branchId || (selectedItem as any)?.branch?.id || '';
    const toId = transferTo === 'central' ? '' : transferTo;
    if (!transferTo) { toast.error('Kahan transfer karna hai — branch select karo'); return; }
    if (toId === fromId) { toast.error('Ye item already isi branch par hai'); return; }
    if (!transferQty || transferQty <= 0) { toast.error('Quantity must be positive'); return; }
    if (transferQty > (selectedItem.currentStock || 0)) {
      toast.error(`Sirf ${selectedItem.currentStock} units available hain`);
      return;
    }
    setTransferReview({ toBranchId: toId, toName: branchNameOf(transferTo), qty: transferQty });
  };

  // Step 2: confirmed — stock-out (source) + stock-in (destination) ka pair.
  const confirmTransfer = async () => {
    if (!selectedItem || !transferReview || transferSaving) return;
    setTransferSaving(true);
    try {
      const fromName = (selectedItem as any)?.branch?.name || 'Central';
      const { toBranchId, toName, qty } = transferReview;
      // Destination row: same name + target branch (nahi hai to banao, 0 stock).
      const sameName = String(selectedItem.name || '').trim().toLowerCase();
      let dest = items.find((it: any) =>
        String(it.name || '').trim().toLowerCase() === sameName &&
        String((it as any).branchId || (it as any).branch?.id || '') === toBranchId
      );
      if (!dest) {
        const created = await inventoryApi.create({
          name: selectedItem.name,
          category: (selectedItem as any).category,
          brand: (selectedItem as any).brand,
          unit: (selectedItem as any).unit,
          currentStock: 0,
          minThreshold: (selectedItem as any).minThreshold ?? 0,
          pricePerUnit: (selectedItem as any).pricePerUnit ?? 0,
          branchId: toBranchId,
        });
        const raw = (created as any)?.data?.data;
        dest = raw?.item || raw || null;
        if (!dest?.id) {
          // List refresh karke dhoondho (backend shape alag ho to bhi mile).
          const rl = await inventoryApi.getAll();
          const arr = (rl as any)?.data?.data?.items || (rl as any)?.data?.data || [];
          dest = (Array.isArray(arr) ? arr : []).find((it: any) =>
            String(it.name || '').trim().toLowerCase() === sameName &&
            String(it.branchId || it.branch?.id || '') === toBranchId
          );
        }
        if (!dest?.id) throw new Error('Destination row nahi bani');
      }
      await inventoryApi.stockOut(selectedItem.id, {
        quantity: qty,
        notes: `Transfer to ${toName} (${qty} ${(selectedItem as any)?.unit || 'units'})`,
      });
      try {
        await inventoryApi.stockIn(dest.id, {
          quantity: qty,
          notes: `Transfer from ${fromName} (${qty} ${(selectedItem as any)?.unit || 'units'})`,
        });
      } catch (inErr: any) {
        // Source se nikal gaya, destination me nahi ghusa — user ko batao,
        // taaki stock kahin atka na lage (ledger me stock-out row maujood hai).
        const raw = inErr?.response?.data?.message || 'Destination me stock add nahi hua';
        toast.error(`Adhura transfer! Source se ${qty} nikle, destination fail: ${Array.isArray(raw) ? raw.join(', ') : raw}`);
        fetchInventory();
        fetchMovements();
        setTransferSaving(false);
        return;
      }
      fetchInventory();
      fetchMovements();
      setIsTransferOpen(false);
      setSelectedItem(null);
      setTransferReview(null);
      setTransferQty(0);
      setTransferTo('');
      toast.success(`${qty} units ${fromName} → ${toName} transferred!`);
    } catch (error: any) {
      const raw = error?.response?.data?.message || error?.message || 'Transfer failed';
      toast.error(Array.isArray(raw) ? raw.join(', ') : raw);
    } finally {
      setTransferSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedItem) return;
    setDeletingId(selectedItem.id);
    try {
      await inventoryApi.delete(selectedItem.id);
      fetchInventory();
      fetchMovements(); // the deleted item's movements are gone from the total
      setIsDeleteDialogOpen(false);
      setSelectedItem(null);
      toast.success('Item deleted successfully');
    } catch (error) {
      toast.error('Failed to delete item');
    } finally {
      setDeletingId(null);
    }
  };

  const handleStockIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedItem) return;

    const formData = new FormData(e.currentTarget);
    const quantity = Number(formData.get('quantity'));
    const remarks = formData.get('remarks') as string;

    if (quantity <= 0) {
      toast.error('Quantity must be positive');
      return;
    }

    try {
      const branchId = (selectedItem as any)?.branchId || (selectedItem as any)?.branch?.id || undefined;
      await inventoryApi.stockIn(selectedItem.id, { quantity, notes: remarks, ...(branchId ? { branchId } : {}) });
      fetchInventory();
      fetchMovements();
      setIsStockInDialogOpen(false);
      setSelectedItem(null);
      toast.success('Stock updated successfully!');
    } catch (error) {
      toast.error('Failed to update stock');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Inventory Management</h1>
          <p className="text-stone-500">Track stock levels and manage solar equipment</p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="outline" className="border-stone-200" onClick={() => { fetchMovements(); setIsStockLogOpen(true); }}>
            <History size={18} className="mr-2" /> Stock Log
          </Button>
          
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            {hasPermission('inventory', 'create') && <DialogTrigger asChild>
              <Button className="bg-orange-600 hover:bg-orange-700 text-white">
                <Plus size={18} className="mr-2" />
                Add Stock Item
              </Button>
            </DialogTrigger>}
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Add New Stock Item</DialogTitle>
                <DialogDescription>Add a new equipment or material to the inventory.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAddStockItem} className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Item Name</Label>
                    <Input id="name" name="name" placeholder="Solar Panel 500W" required />
                    <p className="text-[11px] text-stone-400">Product or equipment name as per catalogue</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="category">Category</Label>
                    <Select name="category" required>
                      <SelectTrigger id="category">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Panel">Panel</SelectItem>
                        <SelectItem value="Inverter">Inverter</SelectItem>
                        <SelectItem value="Battery">Battery</SelectItem>
                        <SelectItem value="Cable">Cable</SelectItem>
                        <SelectItem value="Structure">Structure</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-stone-400">Which category this item belongs to</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="brand">Brand</Label>
                    <Input id="brand" name="brand" placeholder="Tata Solar" required />
                    <p className="text-[11px] text-stone-400">Manufacturer or brand name</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="unit">Unit</Label>
                    <Select name="unit" defaultValue="Nos">
                      <SelectTrigger id="unit">
                        <SelectValue placeholder="Select unit" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Nos">Nos</SelectItem>
                        <SelectItem value="Meters">Meters</SelectItem>
                        <SelectItem value="Sets">Sets</SelectItem>
                        <SelectItem value="Kg">Kg</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-stone-400">Nos (pieces), Meters, Sets, or Kg</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="currentStock">Initial Stock</Label>
                    <Input id="currentStock" name="currentStock" type="number" placeholder="100" required />
                    <p className="text-[11px] text-stone-400">Total quantity being added to inventory</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="minThreshold">Min Alert Level</Label>
                    <Input id="minThreshold" name="minThreshold" type="number" placeholder="10" required />
                    <p className="text-[11px] text-stone-400">Low stock alert — notify when stock falls below this</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pricePerUnit">Price per Unit (Selling)</Label>
                    <Input id="pricePerUnit" name="pricePerUnit" type="number" placeholder="15000" required min="0" />
                    <p className="text-[11px] text-stone-400">Sale price per unit to customers</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="branchId">Branch (optional)</Label>
                    <Select name="branchId" defaultValue="central">
                      <SelectTrigger id="branchId">
                        <SelectValue placeholder="Central stock" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="central">Central (no branch)</SelectItem>
                        {branches.map((b: any) => (
                          <SelectItem key={b.id} value={b.id}>{b.name}{b.region?.name ? ` · ${b.region.name}` : ''}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-stone-400">Kis branch ka stock hai (khali = central)</p>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
                  <Button type="submit" className="bg-orange-600 hover:bg-orange-700 text-white">Save Item</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary Cards — region select par sirf us region ke (strict) */}
      {selectedRegion !== 'all' && (
        <div className="flex items-center gap-2 text-sm">
          <span className="font-semibold text-orange-700 bg-orange-50 border border-orange-200 rounded-full px-3 py-1">
            {selectedRegionName} only
          </span>
          <span className="text-stone-500">stats, stock, usage aur log — sab isi region ke</span>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-stone-200 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
                <Package size={24} />
              </div>
              <Badge variant="secondary" className="bg-blue-50 text-blue-700">Total Items: {filteredItems.length}</Badge>
            </div>
            <div className="mt-4">
              <p className="text-sm font-medium text-stone-500">Total Stock Value</p>
              <p className="text-2xl font-bold text-stone-900">
                ₹{scopedStockValue.toLocaleString()}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-red-100 bg-red-50/30 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="p-2 rounded-lg bg-red-100 text-red-600">
                <AlertTriangle size={24} />
              </div>
              <Badge className="bg-red-600 text-white">Critical</Badge>
            </div>
            <div className="mt-4">
              <p className="text-sm font-medium text-red-600">Low Stock Alerts</p>
              <p className="text-2xl font-bold text-stone-900">{scopedLowCount} Items</p>
              {serverAlerts.length > 0 && (
                <p className="text-[11px] text-stone-500 mt-1" title={serverAlerts.map((a: any) => a.name || a.itemName || a.title).filter(Boolean).join(', ')}>
                  Server: {serverAlerts.length} critical ({serverAlerts.slice(0, 3).map((a: any) => a.name || a.itemName || a.title || 'item').join(', ')}{serverAlerts.length > 3 ? '…' : ''})
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-stone-200 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="p-2 rounded-lg bg-green-50 text-green-600">
                <TrendingDown size={24} />
              </div>
              <Badge variant="secondary" className="bg-green-50 text-green-700">All Time</Badge>
            </div>
            <div className="mt-4">
                    <p className="text-sm font-medium text-stone-500">Stock Out (Value)</p>
              <p className="text-2xl font-bold text-stone-900">₹{scopedOutValue.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-stone-200 shadow-sm">
        <CardHeader className="p-4 border-b border-stone-100">
          <div>
            <CardTitle className="text-lg">Region-wise Usage</CardTitle>
            <CardDescription>STOCK_OUT consumption by movement region. Unknown = bina-region movement.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {scopedUsage.length === 0 ? (
            <p className="text-sm text-stone-400 text-center py-4">
              {selectedRegion === 'all' ? 'No stock-out movements yet' : `${selectedRegionName} me koi stock-out usage nahi`}
            </p>
          ) : (
            <div className="space-y-2">
              {(() => {
                const max = Math.max(1, ...scopedUsage.map(g => g.value));
                return scopedUsage.map((g) => (
                <div key={g.name} className="p-2.5 border border-stone-100 rounded-lg bg-stone-50/50 hover:bg-stone-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="font-normal shrink-0 min-w-24 justify-center">{g.name}</Badge>
                    <span className="text-xs text-stone-500">{g.moves} moves</span>
                    <span className="text-xs text-stone-500">{g.qty.toLocaleString()} units</span>
                    <span className="ml-auto text-sm font-bold text-stone-900">₹{g.value.toLocaleString()}</span>
                  </div>
                  <div className="mt-2 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                    <div className="h-full bg-orange-500 rounded-full" style={{ width: `${Math.round((g.value / max) * 100)}%` }} />
                  </div>
                </div>
                ));
              })()}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-stone-200 shadow-sm">
        <CardHeader className="p-4 border-b border-stone-100">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
              <Input 
                placeholder="Search by name, brand or model..." 
                className="pl-10 h-10 border-stone-200 focus-visible:ring-orange-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            <div className="flex items-center gap-2">
              {selectedRegion !== 'all' && (
                <span className="text-xs font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded-full px-2.5 py-1" title="Sirf us region ka stock (central excluded)">
                  {selectedRegionName} only
                </span>
              )}
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[180px] h-10 border-stone-200">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="Panel">Panels</SelectItem>
                  <SelectItem value="Inverter">Inverters</SelectItem>
                  <SelectItem value="Battery">Batteries</SelectItem>
                  <SelectItem value="Cable">Cables</SelectItem>
                  <SelectItem value="Structure">Structures</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-stone-50">
                <TableHead>Item Details</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Brand/Model</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Stock Status</TableHead>
                <TableHead>Price (Selling)</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-64 text-center">
                    <div className="flex flex-col items-center justify-center text-stone-400">
                      <Loader2 size={48} className="mb-4 animate-spin opacity-20" />
                      <p className="text-lg font-medium">Loading inventory...</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredItems.length > 0 ? (
                filteredItems.map((item) => {
                  const isLow = item.currentStock < item.minThreshold;
                  
                  return (
                    <TableRow key={item.id} className={cn(isLow && "bg-red-50/20")}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-semibold text-stone-900">{item.name}</span>
                          <span className="flex items-center gap-1.5">
                            <span className="text-[10px] text-stone-400 uppercase tracking-wider">{(item.id || '').substring(0, 8)}</span>
                            {(nameCounts.get(String(item.name || '').trim().toLowerCase()) || 0) > 1 && (
                              <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1" title="Same name appears multiple times — possible duplicate">possible duplicate</span>
                            )}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-normal">{item.category}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm text-stone-700">{item.brand}</span>
                        </div>
                      </TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>
                        {(item as any).branch ? (
                          <Badge variant="outline" className="font-normal" title={`Region: ${branchRegionName((item as any).branch)}`}>{(item as any).branch?.name}</Badge>
                        ) : (
                          <Badge variant="outline" className="font-normal text-stone-400" title="Central stock — sab regions ko dikhta hai">Central</Badge>
                        )}
                        {hasPermission('inventory', 'update') && branches.length > 0 && (
                          <Select
                            value={(item as any).branchId || (item as any).branch?.id || 'central'}
                            onValueChange={(v) => handleAssignBranch(item.id, v === 'central' ? '' : v)}
                          >
                            <SelectTrigger className="h-7 w-[130px] mt-1 text-[11px]" title="Branch assign/change">
                              <SelectValue placeholder="Assign" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="central">Central</SelectItem>
                              {branches.map((b: any) => (
                                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1.5 w-32">
                          <div className="flex items-center justify-between text-xs">
                            <span className={cn("font-bold", isLow ? "text-red-600" : "text-stone-700")}>
                              {item.currentStock} {item.unit}
                            </span>
                          </div>
                          {isLow && (
                            <div className="flex items-center gap-1 text-[10px] text-red-600 font-medium">
                              <AlertTriangle size={10} /> Low Stock
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-semibold text-stone-900">₹{(item.pricePerUnit || 0).toLocaleString()}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {hasPermission('inventory', 'update') && <Button 
                            size="sm" 
                            variant="outline" 
                            className="h-8 border-stone-200"
                            onClick={() => {
                              setSelectedItem(item);
                              setIsStockInDialogOpen(true);
                            }}
                          >
                            Stock In
                          </Button>}
                          {hasPermission('inventory', 'update') && <Button 
                            size="sm" 
                            variant="outline" 
                            className="h-8 border-stone-200 text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => {
                              setSelectedItem(item);
                              setIsStockOutDialogOpen(true);
                            }}
                          >
                            Stock Out
                          </Button>}
                          {hasPermission('inventory', 'update') && <Button
                            size="sm"
                            variant="outline"
                            className="h-8 border-stone-200 text-stone-600 hover:text-orange-600 hover:bg-orange-50"
                            onClick={() => openTransfer(item)}
                            title="Doosri branch ko units transfer karo"
                          >
                            <ArrowRightLeft size={14} className="mr-1" /> Transfer
                          </Button>}
                          {hasPermission('inventory', 'delete') && <Button 
                            size="sm" 
                            variant="outline" 
                            className="h-8 border-red-200 text-red-600 hover:bg-red-50"
                            onClick={() => {
                              setSelectedItem(item);
                              setIsDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 size={14} />
                          </Button>}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="h-64 text-center text-stone-400">
                    No inventory items found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Stock In Dialog */}
      <Dialog open={isStockInDialogOpen} onOpenChange={setIsStockInDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Stock In: {selectedItem?.name}</DialogTitle>
            <DialogDescription>Add quantity to existing stock.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleStockIn} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity to Add</Label>
              <Input id="quantity" name="quantity" type="number" placeholder="10" required min="1" />
              <p className="text-[11px] text-stone-400">Number of units being added to current stock</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="remarks">Remarks / Notes</Label>
              <Input id="remarks" name="remarks" placeholder="Monthly restock from vendor" />
              <p className="text-[11px] text-stone-400">Optional — reason or reference for this stock addition</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsStockInDialogOpen(false)}>Cancel</Button>
              <Button type="submit" className="bg-orange-600 hover:bg-orange-700 text-white">Update Stock</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Stock Out Dialog */}
      <Dialog open={isStockOutDialogOpen} onOpenChange={(o) => { setIsStockOutDialogOpen(o); if (!o) { setSelectedItem(null); setStockOutReview(null); setStockOutQty(0); setStockOutPrice(0); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Stock Out: {selectedItem?.name}</DialogTitle>
            <DialogDescription>Remove quantity from stock. Optionally assign to a client.</DialogDescription>
          </DialogHeader>
          {stockOutReview && selectedItem ? (
            <div className="space-y-3 py-2">
              <div className="rounded-xl border border-orange-200 bg-orange-50/60 p-4 space-y-2 text-sm">
                <p className="font-bold text-stone-900">Confirm removal</p>
                {[
                  ['Item', selectedItem.name],
                  ['Branch', (selectedItem as any)?.branch?.name || 'Central'],
                  ['Quantity', `${stockOutReview.quantity} ${(selectedItem as any)?.unit || ''}`],
                  ['Unit price', stockOutReview.unitPrice != null ? `₹${Number(stockOutReview.unitPrice).toLocaleString()}` : '—'],
                  ['Total value', `₹${(stockOutReview.quantity * (stockOutReview.unitPrice || 0)).toLocaleString()}`],
                  ['Client', stockOutReview.clientName || '—'],
                  ['Notes', stockOutReview.notes || '—'],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4">
                    <span className="text-stone-500">{k}</span>
                    <span className="font-semibold text-stone-900 text-right">{v}</span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-stone-400">Ye movement Stock Log me save rahega (client + branch ke saath).</p>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setStockOutReview(null)} disabled={stockOutSaving}>Back</Button>
                <Button type="button" className="bg-red-600 hover:bg-red-700 text-white" onClick={confirmStockOut} disabled={stockOutSaving}>
                  {stockOutSaving && <Loader2 size={14} className="mr-1.5 animate-spin" />} Confirm & Remove
                </Button>
              </DialogFooter>
            </div>
          ) : (
          <form onSubmit={handleStockOut} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="stockOutQuantity">Quantity to Remove</Label>
              <Input id="stockOutQuantity" name="quantity" type="number" placeholder="5" required max={selectedItem?.currentStock}
                onChange={e => setStockOutQty(Number(e.target.value) || 0)} />
              <p className="text-[11px] text-stone-400">Number of units being removed (max: {selectedItem?.currentStock})</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="unitPrice">Selling Price per Unit (₹)</Label>
              <Input id="unitPrice" name="unitPrice" type="number" placeholder="25000"
                onChange={e => setStockOutPrice(Number(e.target.value) || 0)} />
              <p className="text-[11px] text-stone-400">Price at which each unit is being sold to client</p>
            </div>
            {stockOutQty > 0 && stockOutPrice > 0 && (
              <div className="bg-stone-50 p-3 rounded-md text-sm flex justify-between items-center">
                <span className="text-stone-600">Total Value:</span>
                <span className="font-bold text-stone-900">₹{(stockOutQty * stockOutPrice).toLocaleString()}</span>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="clientId">Assign to Client (optional)</Label>
                <Select name="clientId">
                  <SelectTrigger id="clientId">
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent>
                  {wonLeads.map(lead => (
                    <SelectItem key={lead.id} value={lead.id}>{lead.name} — {lead.phone}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-stone-400">Track which client this stock was used for</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Input id="notes" name="notes" placeholder="Used for installation at site" />
              <p className="text-[11px] text-stone-400">Reason or reference for stock removal</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setIsStockOutDialogOpen(false); setSelectedItem(null); }}>Cancel</Button>
              <Button type="submit" className="bg-red-600 hover:bg-red-700 text-white">Review & Remove</Button>
            </DialogFooter>
          </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Transfer Dialog — branch se branch units (Are you sure? confirm) */}
      <Dialog open={isTransferOpen} onOpenChange={(o) => { setIsTransferOpen(o); if (!o) { setSelectedItem(null); setTransferReview(null); setTransferQty(0); setTransferTo(''); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Transfer Stock: {selectedItem?.name}</DialogTitle>
            <DialogDescription>
              {(selectedItem as any)?.branch?.name || 'Central'} se doosri branch ko units bhejo. Log me dono entries rahengi.
            </DialogDescription>
          </DialogHeader>
          {transferReview && selectedItem ? (
            <div className="space-y-3 py-2">
              <div className="rounded-xl border border-orange-200 bg-orange-50/60 p-4 space-y-2 text-sm">
                <p className="font-bold text-stone-900">Are you sure?</p>
                {[
                  ['Item', selectedItem.name],
                  ['From', (selectedItem as any)?.branch?.name || 'Central'],
                  ['To', transferReview.toName],
                  ['Quantity', `${transferReview.qty} ${(selectedItem as any)?.unit || 'units'}`],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4">
                    <span className="text-stone-500">{k}</span>
                    <span className="font-semibold text-stone-900 text-right">{v}</span>
                  </div>
                ))}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setTransferReview(null)} disabled={transferSaving}>Back</Button>
                <Button type="button" className="bg-orange-600 hover:bg-orange-700 text-white" onClick={confirmTransfer} disabled={transferSaving}>
                  {transferSaving && <Loader2 size={14} className="mr-1.5 animate-spin" />} Confirm Transfer
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={handleTransferReview} className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Transfer To</Label>
                <Select value={transferTo || undefined} onValueChange={setTransferTo}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches
                      .filter((b: any) => b.id !== ((selectedItem as any)?.branchId || (selectedItem as any)?.branch?.id))
                      .map((b: any) => (
                        <SelectItem key={b.id} value={b.id}>{b.name}{b.region?.name ? ` · ${b.region.name}` : ''}</SelectItem>
                      ))}
                    {((selectedItem as any)?.branchId || (selectedItem as any)?.branch?.id) && (
                      <SelectItem value="central">Central</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-stone-400">Kis branch ko units bhejne hain</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="transferQty">Quantity</Label>
                <Input
                  id="transferQty"
                  type="number"
                  min={1}
                  max={selectedItem?.currentStock || 0}
                  value={transferQty || ''}
                  onChange={(e) => setTransferQty(Number(e.target.value) || 0)}
                  placeholder="e.g. 3"
                  required
                />
                <p className="text-[11px] text-stone-400">Kitne units (max: {selectedItem?.currentStock || 0} {(selectedItem as any)?.unit || ''})</p>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setIsTransferOpen(false); setSelectedItem(null); }}>Cancel</Button>
                <Button type="submit" className="bg-orange-600 hover:bg-orange-700 text-white">Review Transfer</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Item</DialogTitle>
            <DialogDescription>Are you sure you want to delete <strong>{selectedItem?.name}</strong>? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setIsDeleteDialogOpen(false); setSelectedItem(null); }}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deletingId === selectedItem?.id}>
              {deletingId === selectedItem?.id ? <Loader2 size={16} className="mr-2 animate-spin" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stock Log Dialog */}
      <Dialog open={isStockLogOpen} onOpenChange={setIsStockLogOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Stock Movement Log{selectedRegion !== 'all' ? ` — ${selectedRegionName} only` : ''}</DialogTitle>
            <DialogDescription>Complete history of all stock additions and removals{selectedRegion !== 'all' ? ' (selected region scope)' : ''}.</DialogDescription>
          </DialogHeader>
          {scopedMovements.length === 0 ? (
            <div className="text-center py-12 text-stone-400">
              <History size={40} className="mx-auto mb-3 opacity-40" />
              <p>No movements recorded yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {scopedMovements.map((m: any, i: number) => (
                <div key={m.id || i} className="flex items-start gap-3 p-3 rounded-lg border border-stone-100 bg-card hover:bg-stone-50 transition-colors">
                  <div className={`mt-0.5 w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${m.type === 'STOCK_IN' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                    {m.type === 'STOCK_IN' ? <ArrowDownRight size={16} /> : <ArrowUpLeft size={16} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-sm text-stone-900 truncate">
                        {m.itemName || 'Unnamed Item'}
                      </p>
                      <Badge variant="outline" className={`shrink-0 text-xs ${m.type === 'STOCK_IN' ? 'border-emerald-200 text-emerald-700 bg-emerald-50' : 'border-red-200 text-red-700 bg-red-50'}`}>
                        {m.type === 'STOCK_IN' ? `+${m.quantity}` : `-${m.quantity}`}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-stone-500">
                      <span className="flex items-center gap-1">
                        <Clock size={11} />
                        {m.createdAt ? new Date(m.createdAt).toLocaleString('en-IN') : '—'}
                      </span>
                      <span className="flex items-center gap-1">
                        <User size={11} />
                        {m.createdByName || 'Unknown'}
                      </span>
                      {(m.branchName || m.branch?.name) && (
                        <Badge variant="outline" className="font-normal text-[11px]" title="Branch">
                          {(m.branchName || m.branch?.name) as string}
                        </Badge>
                      )}
                      {(() => {
                        const cm = String(m.notes || '').match(/used for:\s*([^|]+)/i);
                        return cm ? (
                          <span className="text-orange-700 font-medium" title="Assigned client">
                            → {cm[1].trim()}
                          </span>
                        ) : null;
                      })()}
                      {m.unitPrice && (
                        <span className="text-stone-400">₹{Number(m.unitPrice).toLocaleString()}/unit</span>
                      )}
                    </div>
                    {m.notes && (
                      <p className="text-xs text-stone-400 mt-1 italic">{m.notes}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Inventory;
