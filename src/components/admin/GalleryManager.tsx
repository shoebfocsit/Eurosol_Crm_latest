import React, { useState, useEffect } from 'react';
import { 
  Plus, Search, Trash2, Heart, Award, FileImage, Loader2, RefreshCw 
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../ui/dialog';
import { webApi } from '../../services/api';
import { AppImage } from '../AppImage';
import { toast } from 'sonner';

interface GalleryItem {
  id: string;
  alt: string;
  projectId?: string;
  isFeatured: boolean;
  displayOrder: number;
  imageUrl?: string;
}

interface GalleryManagerProps {
  autoCreate?: boolean;
}

const GalleryManager: React.FC<GalleryManagerProps> = ({ autoCreate }) => {
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [featuredFilter, setFeaturedFilter] = useState<'all' | 'featured' | 'standard'>('all');

  // Dialog & Form states
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (autoCreate) {
      setIsDialogOpen(true);
    }
  }, [autoCreate]);

  // Form Field States
  const [alt, setAlt] = useState('');
  const [projectId, setProjectId] = useState('');
  const [isFeatured, setIsFeatured] = useState(false);
  const [displayOrder, setDisplayOrder] = useState<number>(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const fetchGallery = async () => {
    setIsLoading(true);
    try {
      const resp = await webApi.getGallery(
        featuredFilter === 'featured' ? { featured: true } : featuredFilter === 'standard' ? { featured: false } : undefined
      );
      const data = resp.data.data?.images || resp.data.data || resp.data;
      setGallery(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast.error('Failed to fetch gallery images');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchGallery();
  }, [featuredFilter]);

  const openCreateDialog = () => {
    setAlt('');
    setProjectId('');
    setIsFeatured(false);
    setDisplayOrder(gallery.length + 1);
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
    if (!alt.trim()) {
      toast.error('Alt text is required for accessibility');
      return;
    }
    if (!selectedFile) {
      toast.error('Please choose an image file to upload');
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('alt', alt);
      if (projectId) {
        formData.append('projectId', projectId);
      }
      formData.append('isFeatured', String(isFeatured));
      formData.append('displayOrder', String(displayOrder));
      formData.append('image', selectedFile);

      await webApi.createGallery(formData);
      toast.success('Gallery image uploaded successfully!');

      setIsDialogOpen(false);
      fetchGallery();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error uploading image');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this gallery image?')) return;
    try {
      await webApi.deleteGallery(id);
      toast.success('Image deleted from gallery');
      fetchGallery();
    } catch (err) {
      toast.error('Failed to delete gallery image');
    }
  };

  return (
    <Card className="border-stone-200 shadow-sm">
      <CardHeader className="p-4 border-b border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <CardTitle className="text-lg font-bold">Web Gallery</CardTitle>
          <CardDescription>Manages interactive image catalogs, installation feeds, and showcases</CardDescription>
        </div>
        <Button onClick={openCreateDialog} className="bg-orange-600 hover:bg-orange-700 text-white gap-2">
          <Plus size={16} /> Upload Image
        </Button>
      </CardHeader>
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
          <div className="flex bg-stone-100 p-0.5 rounded-lg border border-stone-200 text-xs">
            <button 
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${featuredFilter === 'all' ? 'bg-card shadow text-stone-900' : 'text-stone-500'}`}
              onClick={() => setFeaturedFilter('all')}
            >
              All Images
            </button>
            <button 
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${featuredFilter === 'featured' ? 'bg-card shadow text-stone-900' : 'text-stone-500'}`}
              onClick={() => setFeaturedFilter('featured')}
            >
              Featured Only
            </button>
            <button 
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${featuredFilter === 'standard' ? 'bg-card shadow text-stone-900' : 'text-stone-500'}`}
              onClick={() => setFeaturedFilter('standard')}
            >
              Standard Only
            </button>
          </div>
          <Button variant="outline" size="sm" onClick={fetchGallery} className="text-xs h-8 border-stone-200">
            <RefreshCw size={12} className="mr-1.5" /> Refresh
          </Button>
        </div>

        {isLoading ? (
          <div className="h-64 flex flex-col items-center justify-center text-stone-400">
            <Loader2 size={36} className="animate-spin mb-4" />
            <p>Loading gallery images...</p>
          </div>
        ) : gallery.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {gallery.map((item) => (
              <div key={item.id} className="group relative border border-stone-200 rounded-lg overflow-hidden bg-stone-50 shadow-sm hover:shadow-md transition-all">
                <div className="aspect-video w-full relative">
                  {item.imageUrl ? (
                    <AppImage 
                      src={item.imageUrl} 
                      alt={item.alt} 
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full bg-stone-200 flex items-center justify-center text-stone-400">
                      <FileImage size={24} />
                    </div>
                  )}
                  {item.isFeatured && (
                    <span className="absolute top-1.5 left-1.5 p-1 rounded-md bg-orange-600 text-white text-[9px] font-bold flex items-center gap-1 shadow">
                      <Heart size={8} className="fill-white" /> Featured
                    </span>
                  )}
                  <span className="absolute top-1.5 right-1.5 bg-black/60 text-white rounded px-1.5 py-0.5 text-[9px] font-mono">
                    Order: {item.displayOrder}
                  </span>
                </div>
                <div className="p-2 bg-card">
                  <p className="text-xs font-semibold text-stone-800 line-clamp-1">{item.alt}</p>
                  {item.projectId && (
                    <p className="text-[10px] text-stone-500 line-clamp-1 mt-0.5">Project ID: {item.projectId}</p>
                  )}
                  
                  <div className="mt-2 pt-2 border-t border-stone-100 flex items-center justify-end">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleToggleFeatured(item)} 
                      className={`h-7 w-7 ${item.isFeatured ? 'text-orange-600' : 'text-stone-400'}`}
                      title="Keep or Toggle showcase"
                    >
                      <Heart size={12} className={item.isFeatured ? "fill-orange-600" : ""} />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleDelete(item.id)} 
                      className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50 ml-1"
                      title="Delete Image"
                    >
                      <Trash2 size={12} />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-48 border border-dashed border-stone-200 rounded-lg flex flex-col items-center justify-center text-stone-400">
            <FileImage size={32} className="mb-2 opacity-50" />
            <p className="text-sm font-medium">No images uploaded yet</p>
          </div>
        )}
      </CardContent>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Gallery Action</DialogTitle>
            <DialogDescription>
              Select an installation photo and give it an descriptive tag caption.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-stone-700">Caption / Alternative Text *</label>
              <Input 
                value={alt} 
                onChange={(e) => setAlt(e.target.value)} 
                placeholder="e.g. 10kW On-Grid System under construction" 
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-stone-700">Display Order</label>
                <Input 
                  type="number"
                  value={displayOrder} 
                  onChange={(e) => setDisplayOrder(Number(e.target.value))} 
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-stone-700">Link Project ID (Optional)</label>
                <Input 
                  value={projectId} 
                  onChange={(e) => setProjectId(e.target.value)} 
                  placeholder="Insert optional project UUID"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 border border-stone-100 p-2 text-xs bg-stone-50 rounded-md">
              <input 
                type="checkbox" 
                id="galleryFeaturedBtn"
                checked={isFeatured} 
                onChange={(e) => setIsFeatured(e.target.checked)} 
                className="w-4 h-4 accent-orange-600 cursor-pointer"
              />
              <label htmlFor="galleryFeaturedBtn" className="font-semibold text-stone-700 cursor-pointer">Showcase on Home Page Slider</label>
            </div>

            <div className="space-y-1 border border-dashed border-stone-200 p-4 rounded-md flex flex-col items-center justify-center text-center">
              <FileImage className="text-stone-400 mb-1" size={24} />
              <span className="text-xs font-medium text-stone-600">Select Image File *</span>
              <input 
                type="file" 
                accept="image/*" 
                onChange={handleFileChange} 
                className="text-xs text-stone-600 mt-2"
                required
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" className="bg-orange-600 hover:bg-orange-700 text-white" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin mr-2" /> Uploading...
                  </>
                ) : (
                  'Upload to Gallery'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );

  async function handleToggleFeatured(item: GalleryItem) {
    toast.info('Re-upload with status update to edit highlights');
  }
};

export default GalleryManager;
