import React, { useState, useEffect } from 'react';
import { 
  Plus, Search, Edit2, Trash2, Video, Key, Play, RefreshCw, Loader2 
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../ui/dialog';
import { webApi } from '../../services/api';
import { toast } from 'sonner';

interface VideoRef {
  id: string;
  youtubeId: string;
  title: string;
  section: 'home' | 'projects' | 'both';
  displayOrder: number;
  isActive: boolean;
}

const VideosManager: React.FC = () => {
  const [videos, setVideos] = useState<VideoRef[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sectionFilter, setSectionFilter] = useState<string>('all');

  // Dialog & Form states
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingVideo, setEditingVideo] = useState<VideoRef | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form Field States
  const [title, setTitle] = useState('');
  const [youtubeId, setYoutubeId] = useState('');
  const [section, setSection] = useState<'home' | 'projects' | 'both'>('both');
  const [displayOrder, setDisplayOrder] = useState<number>(0);
  const [isActive, setIsActive] = useState(true);

  const fetchVideos = async () => {
    setIsLoading(true);
    try {
      const resp = await webApi.getVideos(
        sectionFilter !== 'all' ? { section: sectionFilter } : undefined
      );
      const data = resp.data.data?.videos || resp.data.data || resp.data;
      setVideos(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error('Failed to fetch videos');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchVideos();
  }, [sectionFilter]);

  const openCreateDialog = () => {
    setEditingVideo(null);
    setTitle('');
    setYoutubeId('');
    setSection('both');
    setDisplayOrder(videos.length + 1);
    setIsActive(true);
    setIsDialogOpen(true);
  };

  const openEditDialog = (vid: VideoRef) => {
    setEditingVideo(vid);
    setTitle(vid.title || '');
    setYoutubeId(vid.youtubeId || '');
    setSection(vid.section || 'both');
    setDisplayOrder(vid.displayOrder || 0);
    setIsActive(!!vid.isActive);
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !youtubeId.trim()) {
      toast.error('Title and YouTube ID are required');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingVideo) {
        await webApi.updateVideo(editingVideo.id, {
          title,
          section,
          displayOrder,
          isActive
        });
        toast.success('Video updated successfully!');
      } else {
        await webApi.createVideo({
          youtubeId,
          title,
          section,
          displayOrder
        });
        toast.success('Video added successfully!');
      }

      setIsDialogOpen(false);
      fetchVideos();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error occurred saving video');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this video?')) return;
    try {
      await webApi.deleteVideo(id);
      toast.success('Video deleted!');
      fetchVideos();
    } catch (err) {
      toast.error('Failed to delete video record');
    }
  };

  return (
    <Card className="border-stone-200 shadow-sm">
      <CardHeader className="p-4 border-b border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <CardTitle className="text-lg font-bold">Videos Section</CardTitle>
          <CardDescription>Embed YouTube site tours, informational clips, or completed systems</CardDescription>
        </div>
        <Button onClick={openCreateDialog} className="bg-orange-600 hover:bg-orange-700 text-white gap-2">
          <Plus size={16} /> Add Video
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex bg-stone-100 p-0.5 rounded-lg border border-stone-200 text-xs w-fit">
            <button 
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${sectionFilter === 'all' ? 'bg-card shadow text-stone-900' : 'text-stone-500'}`}
              onClick={() => setSectionFilter('all')}
            >
              All Sections
            </button>
            <button 
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${sectionFilter === 'home' ? 'bg-card shadow text-stone-900' : 'text-stone-500'}`}
              onClick={() => setSectionFilter('home')}
            >
              Home Placement
            </button>
            <button 
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${sectionFilter === 'projects' ? 'bg-card shadow text-stone-900' : 'text-stone-500'}`}
              onClick={() => setSectionFilter('projects')}
            >
              Projects Placement
            </button>
            <button 
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${sectionFilter === 'both' ? 'bg-card shadow text-stone-900' : 'text-stone-500'}`}
              onClick={() => setSectionFilter('both')}
            >
              Both
            </button>
          </div>
          <Button variant="outline" size="sm" onClick={fetchVideos} className="h-8 text-xs border-stone-200">
            <RefreshCw size={12} className="mr-1.5" /> Refresh
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="bg-stone-50">
              <TableHead className="w-16">Preview</TableHead>
              <TableHead>Video Details</TableHead>
              <TableHead>YouTube ID</TableHead>
              <TableHead>Placement</TableHead>
              <TableHead>Display Order</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center">
                  <div className="flex flex-col items-center justify-center text-stone-400">
                    <Loader2 size={24} className="animate-spin mb-1" />
                    <span>Loading embeds...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : videos.length > 0 ? (
              videos.map((vid) => (
                <TableRow key={vid.id}>
                  <TableCell>
                    <a 
                      href={`https://www.youtube.com/watch?v=${vid.youtubeId}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="w-12 h-8 bg-stone-900 flex items-center justify-center text-white rounded hover:bg-orange-600 transition-colors cursor-pointer group"
                    >
                      <Play size={14} className="group-hover:scale-125 transition-transform" />
                    </a>
                  </TableCell>
                  <TableCell>
                    <span className="font-semibold text-stone-900 block">{vid.title}</span>
                  </TableCell>
                  <TableCell>
                    <code className="text-xs bg-stone-50 px-1.5 py-0.5 rounded border border-stone-100 font-mono select-all">
                      {vid.youtubeId}
                    </code>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">{vid.section}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{vid.displayOrder}</TableCell>
                  <TableCell>
                    {vid.isActive ? (
                      <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-none">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Hidden</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => openEditDialog(vid)} className="h-8 w-8 text-stone-600">
                        <Edit2 size={14} />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(vid.id)} className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50">
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-stone-400">
                  No video embeds found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingVideo ? 'Edit YouTube Link' : 'Embed YouTube Video'}</DialogTitle>
            <DialogDescription>
              Submit video codes to play customer stories or technical presentations.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-stone-700">Video Title *</label>
              <Input 
                value={title} 
                onChange={(e) => setTitle(e.target.value)} 
                placeholder="e.g. Testimonial - Rajesh Kumar 5kW Installation" 
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-stone-700">YouTube Video ID *</label>
                <Input 
                  value={youtubeId} 
                  onChange={(e) => setYoutubeId(e.target.value)} 
                  placeholder="e.g. xKxrkht7CpY" 
                  disabled={!!editingVideo}
                  required
                />
                <span className="text-[9px] text-stone-400 font-medium block">From: youtube.com/watch?v=<b>[ID]</b></span>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-stone-700">Display Order</label>
                <Input 
                  type="number"
                  value={displayOrder} 
                  onChange={(e) => setDisplayOrder(Number(e.target.value))} 
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-stone-700">Placement Section *</label>
              <select
                className="w-full h-10 border border-stone-200 rounded-md px-3 text-sm bg-card"
                value={section}
                onChange={(e) => setSection(e.target.value as any)}
              >
                <option value="home">Home Page Only</option>
                <option value="projects">Projects Portfolio Page Only</option>
                <option value="both">Both Sections</option>
              </select>
            </div>

            {editingVideo && (
              <div className="flex items-center gap-2 border border-stone-100 p-2 text-xs bg-stone-50 rounded-md">
                <input 
                  type="checkbox" 
                  id="vidActiveBtn"
                  checked={isActive} 
                  onChange={(e) => setIsActive(e.target.checked)} 
                  className="w-4 h-4 accent-orange-600 cursor-pointer"
                />
                <label htmlFor="vidActiveBtn" className="font-semibold text-stone-700 cursor-pointer">Visible & Playable (Active)</label>
              </div>
            )}

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
                  'Save Embed'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default VideosManager;
