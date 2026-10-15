import React, { useState, useEffect } from 'react';
import { 
  Plus, Edit2, Trash2, Star, UserCheck, CheckCircle, RefreshCw, Loader2 
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../ui/dialog';
import { webApi } from '../../services/api';
import { toast } from 'sonner';

interface Testimonial {
  id: string;
  name: string;
  city: string;
  quote: string;
  rating: number;
  avatarUrl?: string;
  isActive: boolean;
}

interface TestimonialsManagerProps {
  autoCreate?: boolean;
}

const TestimonialsManager: React.FC<TestimonialsManagerProps> = ({ autoCreate }) => {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Dialog & Form states
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTestimonial, setEditingTestimonial] = useState<Testimonial | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (autoCreate) {
      setEditingTestimonial(null);
      setIsDialogOpen(true);
    }
  }, [autoCreate]);

  // Form Field States
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [quote, setQuote] = useState('');
  const [rating, setRating] = useState<number>(5);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [isActive, setIsActive] = useState(true);

  const fetchTestimonials = async () => {
    setIsLoading(true);
    try {
      const resp = await webApi.getTestimonials();
      const data = resp.data.data?.testimonials || resp.data.data || resp.data;
      setTestimonials(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error('Failed to fetch testimonials');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTestimonials();
  }, []);

  const openCreateDialog = () => {
    setEditingTestimonial(null);
    setName('');
    setCity('');
    setQuote('');
    setRating(5);
    setAvatarUrl('');
    setIsActive(true);
    setIsDialogOpen(true);
  };

  const openEditDialog = (testi: Testimonial) => {
    setEditingTestimonial(testi);
    setName(testi.name || '');
    setCity(testi.city || '');
    setQuote(testi.quote || '');
    setRating(testi.rating || 5);
    setAvatarUrl(testi.avatarUrl || '');
    setIsActive(!!testi.isActive);
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !quote.trim()) {
      toast.error('Client name and quote content are required.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingTestimonial) {
        await webApi.updateTestimonial(editingTestimonial.id, {
          name,
          city,
          quote,
          rating,
          isActive
        });
        toast.success('Testimonial details updated successfully!');
      } else {
        await webApi.createTestimonial({
          name,
          city,
          quote,
          rating,
          avatarUrl,
          isActive
        });
        toast.success('Testimonial created successfully!');
      }

      setIsDialogOpen(false);
      fetchTestimonials();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error occurred saving testimonial');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this user testimonial?')) return;
    try {
      await webApi.deleteTestimonial(id);
      toast.success('Testimonial record removed.');
      fetchTestimonials();
    } catch (err) {
      toast.error('Failed to remove testimonial');
    }
  };

  return (
    <Card className="border-stone-200 shadow-sm">
      <CardHeader className="p-4 border-b border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <CardTitle className="text-lg font-bold">Client Reviews & Testimonials</CardTitle>
          <CardDescription>Configure star reviews and customer comments appearing on the landing page</CardDescription>
        </div>
        <Button onClick={openCreateDialog} className="bg-orange-600 hover:bg-orange-700 text-white gap-2">
          <Plus size={16} /> Add Testimonial
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <div className="p-4 flex items-center justify-between">
          <span className="text-xs text-stone-500 font-semibold">{testimonials.length} reviews synchronized</span>
          <Button variant="outline" size="sm" onClick={fetchTestimonials} className="h-8 text-xs border-stone-200">
            <RefreshCw size={12} className="mr-1.5" /> Reload
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="bg-stone-50">
              <TableHead>Customer</TableHead>
              <TableHead>Rating</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Quote Message</TableHead>
              <TableHead>Show on Site</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center">
                  <div className="flex flex-col items-center justify-center text-stone-400">
                    <Loader2 size={24} className="animate-spin mb-1" />
                    <span>Loading reviews...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : testimonials.length > 0 ? (
              testimonials.map((testi) => (
                <TableRow key={testi.id}>
                  <TableCell className="font-semibold text-stone-900">{testi.name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star 
                          key={i} 
                          size={12} 
                          className={i < testi.rating ? "text-orange-500 fill-orange-500" : "text-stone-300"} 
                        />
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs font-medium text-stone-600">{testi.city}</TableCell>
                  <TableCell className="max-w-md text-xs text-stone-600 truncate italic">
                    "{testi.quote}"
                  </TableCell>
                  <TableCell>
                    {testi.isActive ? (
                      <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-none">Visible</Badge>
                    ) : (
                      <Badge variant="secondary">In Draft</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => openEditDialog(testi)} className="h-8 w-8 text-stone-600">
                        <Edit2 size={14} />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(testi.id)} className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50">
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-stone-400">
                  No testimonials found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Client Testimonial Editor</DialogTitle>
            <DialogDescription>
              Submit happy feedback to reinforce trust on the visitor homepage.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-stone-700">Client Name *</label>
                <Input 
                  value={name} 
                  onChange={(e) => setName(e.target.value)} 
                  placeholder="e.g. Rahul Sharma" 
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-stone-700">City / Suburb</label>
                <Input 
                  value={city} 
                  onChange={(e) => setCity(e.target.value)} 
                  placeholder="e.g. Indore" 
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-stone-700">Rating Stars (1-5)</label>
                <select
                  className="w-full h-10 border border-stone-200 rounded-md px-3 text-sm bg-card"
                  value={rating}
                  onChange={(e) => setRating(Number(e.target.value))}
                >
                  <option value="5">⭐⭐⭐⭐⭐ (5 Stars)</option>
                  <option value="4">⭐⭐⭐⭐ (4 Stars)</option>
                  <option value="3">⭐⭐⭐ (3 Stars)</option>
                  <option value="2">⭐⭐ (2 Stars)</option>
                  <option value="1">⭐ (1 Star)</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-stone-700">Avatar Image URL (Optional)</label>
                <Input 
                  value={avatarUrl} 
                  onChange={(e) => setAvatarUrl(e.target.value)} 
                  placeholder="https://picsum.photos/100" 
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-stone-700">Feedback Description *</label>
              <textarea
                className="w-full p-2 border border-stone-200 rounded-md text-sm h-24"
                value={quote}
                onChange={(e) => setQuote(e.target.value)}
                placeholder="Write the recommendation quote from the customer here..."
                required
              />
            </div>

            <div className="flex items-center gap-2 border border-stone-100 p-2.5 text-xs bg-stone-50 rounded-md">
              <input 
                type="checkbox" 
                id="testimonialActiveBtn"
                checked={isActive} 
                onChange={(e) => setIsActive(e.target.checked)} 
                className="w-4 h-4 accent-orange-600 cursor-pointer"
              />
              <label htmlFor="testimonialActiveBtn" className="font-semibold text-stone-700 cursor-pointer">Approved (Publish to Live Site)</label>
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
                  'Publish Testimonial'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default TestimonialsManager;
