import React, { useState, useEffect } from 'react';
import { 
  Plus, Search, Edit2, Trash2, Check, Star, RefreshCw, Loader2, X 
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../ui/dialog';
import { webApi } from '../../services/api';
import { toast } from 'sonner';

interface AMCPlan {
  id: string;
  name: string;
  pricePerYear: number;
  visitsPerYear: number;
  features: string; // JSON string of string[] e.g. '["Clean","Check"]'
  isPopular: boolean;
  isActive: boolean;
}

const AmcPlansManager: React.FC = () => {
  const [plans, setPlans] = useState<AMCPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Dialog & Form states
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<AMCPlan | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form fields
  const [name, setName] = useState('');
  const [pricePerYear, setPricePerYear] = useState<number>(0);
  const [visitsPerYear, setVisitsPerYear] = useState<number>(1);
  const [isPopular, setIsPopular] = useState(false);
  const [isActive, setIsActive] = useState(true);
  
  // Custom features array editor state
  const [currentFeatureInput, setCurrentFeatureInput] = useState('');
  const [featuresList, setFeaturesList] = useState<string[]>([]);

  const fetchPlans = async () => {
    setIsLoading(true);
    try {
      const resp = await webApi.getAmcPlans();
      const data = resp.data.data?.plans || resp.data.data || resp.data;
      setPlans(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error('Failed to load AMC plans');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const openCreateDialog = () => {
    setEditingPlan(null);
    setName('');
    setPricePerYear(4999);
    setVisitsPerYear(2);
    setIsPopular(false);
    setIsActive(true);
    setFeaturesList(['Regular Panel Cleaning', 'Inverter Diagnostics', 'Tighten Cable Connections']);
    setIsDialogOpen(true);
  };

  const openEditDialog = (plan: AMCPlan) => {
    setEditingPlan(plan);
    setName(plan.name || '');
    setPricePerYear(plan.pricePerYear || 0);
    setVisitsPerYear(plan.visitsPerYear || 1);
    setIsPopular(!!plan.isPopular);
    setIsActive(!!plan.isActive);
    
    // Parse JSON string safely
    try {
      const parsed = JSON.parse(plan.features || '[]');
      setFeaturesList(Array.isArray(parsed) ? parsed : []);
    } catch {
      setFeaturesList([]);
    }
    
    setIsDialogOpen(true);
  };

  const addFeature = () => {
    if (currentFeatureInput.trim()) {
      setFeaturesList(item => [...item, currentFeatureInput.trim()]);
      setCurrentFeatureInput('');
    }
  };

  const removeFeature = (idx: number) => {
    setFeaturesList(list => list.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Plan Name is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name,
        pricePerYear,
        visitsPerYear,
        features: JSON.stringify(featuresList),
        isPopular,
        isActive
      };

      if (editingPlan) {
        await webApi.updateAmcPlan(editingPlan.id, payload);
        toast.success('Amc plan updated!');
      } else {
        await webApi.createAmcPlan(payload);
        toast.success('Amc plan created successfully!');
      }

      setIsDialogOpen(false);
      fetchPlans();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error occurred saving plan');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this annual maintenance package?')) return;
    try {
      await webApi.deleteAmcPlan(id);
      toast.success('Plan deleted!');
      fetchPlans();
    } catch (err) {
      toast.error('Failed to remove AMC plan');
    }
  };

  return (
    <Card className="border-stone-200 shadow-sm">
      <CardHeader className="p-4 border-b border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <CardTitle className="text-lg font-bold">Annual Maintenance Contract (AMC) Plans</CardTitle>
          <CardDescription>Configure packages for routine solar washing, electrical checking, and priority support</CardDescription>
        </div>
        <Button onClick={openCreateDialog} className="bg-orange-600 hover:bg-orange-700 text-white gap-2">
          <Plus size={16} /> Add AMC Plan
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <div className="p-4 flex items-center justify-between text-xs font-semibold text-stone-500">
          <span>{plans.length} active packages online</span>
          <Button variant="outline" size="sm" onClick={fetchPlans} className="h-8 border-stone-200 text-xs text-stone-700">
            <RefreshCw size={12} className="mr-1.5" /> Sync
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="bg-stone-50">
              <TableHead>Plan Name</TableHead>
              <TableHead>Annual Cost</TableHead>
              <TableHead>Visits / Year</TableHead>
              <TableHead>Covered Features</TableHead>
              <TableHead>Status Labels</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center">
                  <div className="flex flex-col items-center justify-center text-stone-400">
                    <Loader2 size={24} className="animate-spin mb-1" />
                    <span>Loading packages...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : plans.length > 0 ? (
              plans.map((plan) => {
                let parsedFeatures: string[] = [];
                try {
                  parsedFeatures = JSON.parse(plan.features || '[]');
                } catch {
                  parsedFeatures = [];
                }

                return (
                  <TableRow key={plan.id}>
                    <TableCell className="font-semibold text-stone-900">
                      <div className="flex items-center gap-1.5 animate-fade-in">
                        {plan.name}
                        {plan.isPopular && (
                          <Badge className="bg-orange-100 hover:bg-orange-100 text-orange-600 border-none h-4 text-[9px] font-bold">
                            Popular Choice
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-bold text-stone-950">₹{plan.pricePerYear?.toLocaleString() || '0'} / year</TableCell>
                    <TableCell className="text-xs text-stone-500 font-medium">
                      {plan.visitsPerYear} {plan.visitsPerYear === 1 ? 'visit' : 'visits'} annually
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <div className="flex flex-wrap gap-1">
                        {parsedFeatures.slice(0, 3).map((f, i) => (
                          <Badge key={i} variant="outline" className="text-[10px] font-normal leading-tight text-stone-600 bg-stone-50 truncate max-w-[120px]">
                            {f}
                          </Badge>
                        ))}
                        {parsedFeatures.length > 3 && (
                          <span className="text-[9px] text-stone-400 self-center font-medium">+{parsedFeatures.length - 3} more</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {plan.isActive ? (
                        <Badge className="bg-green-105 text-green-700 bg-green-50 hover:bg-green-100 border-green-200">Active</Badge>
                      ) : (
                        <Badge variant="secondary">Draft Mode</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(plan)} className="h-8 w-8 text-stone-600">
                          <Edit2 size={14} />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(plan.id)} className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50">
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-stone-400">
                  No maintenance plans configured
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingPlan ? 'Edit AMC Plan' : 'Add AMC Plan'}</DialogTitle>
            <DialogDescription>
              Deploy and custom outline a package level for consumers looking for routine protection.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-stone-700">Plan Name *</label>
              <Input 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                placeholder="e.g. Premium Care wash" 
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-stone-700">Annual Cost (INR) *</label>
                <Input 
                  type="number"
                  value={pricePerYear} 
                  onChange={(e) => setPricePerYear(Number(e.target.value))} 
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-stone-700">Visits per Year *</label>
                <Input 
                  type="number"
                  value={visitsPerYear} 
                  onChange={(e) => setVisitsPerYear(Number(e.target.value))} 
                  required
                />
              </div>
            </div>

            <div className="space-y-2 border border-stone-100 p-3 rounded bg-stone-50/50">
              <label className="text-xs font-bold text-stone-700 flex justify-between items-center">
                <span>Manage Plan Features List</span>
                <span className="text-[10px] text-stone-400 font-normal">{featuresList.length} items defined</span>
              </label>

              <div className="flex gap-1.5 h-10">
                <Input 
                  value={currentFeatureInput} 
                  onChange={(e) => setCurrentFeatureInput(e.target.value)} 
                  placeholder="e.g. Full washing or cable checks" 
                  className="flex-1 text-xs h-9 bg-card"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addFeature();
                    }
                  }}
                />
                <Button type="button" onClick={addFeature} className="bg-stone-900 text-white h-9 text-xs">
                  Add Item
                </Button>
              </div>

              <div className="pt-2 max-h-32 overflow-y-auto space-y-1">
                {featuresList.map((f, i) => (
                  <div key={i} className="flex items-center justify-between bg-card text-xs px-2.5 py-1.5 rounded border border-stone-200">
                    <span className="flex items-center gap-1.5"><Check size={10} className="text-green-600" /> {f}</span>
                    <button type="button" onClick={() => removeFeature(i)} className="text-red-500 hover:text-red-700 self-center">
                      <X size={12} />
                    </button>
                  </div>
                ))}
                {featuresList.length === 0 && (
                  <p className="text-[10px] text-stone-400 text-center py-2 italic">No features listed. Populate list above.</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 border border-stone-100 p-2 text-xs bg-stone-50 rounded-md">
              <div className="flex items-center gap-2">
                <input 
                  type="checkbox" 
                  id="amcPopularBtn"
                  checked={isPopular} 
                  onChange={(e) => setIsPopular(e.target.checked)} 
                  className="w-4 h-4 accent-orange-600 cursor-pointer"
                />
                <label htmlFor="amcPopularBtn" className="font-semibold text-stone-700 cursor-pointer">Highlight as High-Value Popular Plan</label>
              </div>

              <div className="flex items-center gap-2">
                <input 
                  type="checkbox" 
                  id="amcActiveBtn"
                  checked={isActive} 
                  onChange={(e) => setIsActive(e.target.checked)} 
                  className="w-4 h-4 accent-orange-600 cursor-pointer"
                />
                <label htmlFor="amcActiveBtn" className="font-semibold text-stone-700 cursor-pointer">Published on Site</label>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" className="bg-orange-600 hover:bg-orange-700 text-white" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Saving...
                  </>
                ) : (
                  'Deploy AMC Plan'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default AmcPlansManager;
