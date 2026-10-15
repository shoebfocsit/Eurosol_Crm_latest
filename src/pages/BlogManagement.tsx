import React, { useState, useEffect } from 'react';
import {
  FileText, Search, Plus, Loader2, Edit3, Trash2, Star, Eye
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { blogApi } from '../services/api';
import { BlogPost } from '../types';
import { toast } from 'sonner';
import { cn, toLocalDateKey } from '@/lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { useSearchParams } from 'react-router-dom';

const CATEGORIES = ['Case Study', 'Educational', 'News', 'Announcement', 'Technical', 'Other'];

const BlogManagement: React.FC = () => {
  const { hasPermission } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<BlogPost | null>(null);
  const [featuredChecked, setFeaturedChecked] = useState(false);

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setEditingPost(null);
      setIsDialogOpen(true);
      searchParams.delete('new');
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [togglingSlug, setTogglingSlug] = useState<string | null>(null);

  const handleToggleFeatured = async (post: BlogPost) => {
    setTogglingSlug(post.slug);
    try {
      await blogApi.update(post.slug, { featured: !post.featured });
      toast.success(post.featured ? 'Removed from featured' : 'Marked as featured — website section live');
      fetchPosts();
    } catch {
      toast.error('Failed to update featured flag');
    } finally {
      setTogglingSlug(null);
    }
  };
  const [saving, setSaving] = useState(false);

  const fetchPosts = async () => {
    setIsLoading(true);
    try {
      const res = await blogApi.getPosts();
      const data = res.data.data?.posts || res.data.data || [];
      setPosts(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Failed to fetch blog posts');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchPosts(); }, []);

  const filtered = posts.filter(p => {
    // title/slug come from the API and are not guaranteed — a bare
    // `.toLowerCase()` here throws and white-screens the whole CMS.
    const matchSearch = !search
      || String(p.title || '').toLowerCase().includes(search.toLowerCase())
      || String(p.slug || '').toLowerCase().includes(search.toLowerCase());
    const matchCat = categoryFilter === 'all' || p.category === categoryFilter;
    return matchSearch && matchCat;
  });

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const title = fd.get('title') as string;
    const authorName = (fd.get('author') as string) || 'EuroSol Team';
    const readTimeRaw = Number(fd.get('readTime'));
    const tagsRaw = (fd.get('tags') as string) || '';
    const payload: any = {
      title,
      slug: fd.get('slug') as string,
      category: fd.get('category') as string || 'Other',
      excerpt: fd.get('excerpt') as string || undefined,
      // `Number(x) || undefined` would discard a deliberate 0.
      readTime: isFinite(readTimeRaw) ? readTimeRaw : undefined,
      date: fd.get('date') as string || undefined,
      // Stored as an object but typed/edited as a string — keep it a string.
      author: authorName,
      heroImage: fd.get('heroImage') as string || undefined,
      featured: featuredChecked,
      tags: tagsRaw.split(',').map(t => t.trim()).filter(Boolean),
    };
    const contentVal = fd.get('content') as string;
    if (contentVal) {
      try {
        const parsed = JSON.parse(contentVal);
        payload.content = Array.isArray(parsed) ? parsed : [{ id: 'c1', type: 'text', heading: title, body: contentVal }];
      } catch {
        payload.content = [{ id: 'c1', type: 'text', heading: title, body: contentVal }];
      }
    }
    try {
      if (editingPost) {
        await blogApi.update(editingPost.slug, payload);
        toast.success('Blog post updated!');
      } else {
        await blogApi.create(payload);
        toast.success('Blog post created!');
      }
      setIsDialogOpen(false);
      setEditingPost(null);
      fetchPosts();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to save blog post');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (slug: string) => {    setIsDeleting(slug);
    try {
      await blogApi.delete(slug);
      toast.success('Blog post deleted');
      fetchPosts();
    } catch {
      toast.error('Failed to delete');
    } finally {
      setIsDeleting(null);
    }
  };

  const openEdit = (post: BlogPost) => {
    setEditingPost(post);
    setFeaturedChecked(!!post.featured);
    setIsDialogOpen(true);
  };

  const openCreate = () => {
    setEditingPost(null);
    setFeaturedChecked(false);
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Blog Management</h1>
          <p className="text-stone-500">Manage blog posts and articles</p>
        </div>
        {hasPermission('blog', 'create') && (
        <Button className="bg-orange-600 hover:bg-orange-700 text-white" onClick={openCreate}>
          <Plus size={18} className="mr-2" /> New Post
        </Button>
        )}
      </div>

      <Card className="border-stone-200 shadow-sm">
        <CardHeader className="p-4 border-b border-stone-100">
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
              <Input placeholder="Search by title or slug..." className="pl-10 h-10 border-stone-200" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[180px] h-10 border-stone-200">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-stone-50">
                <TableHead>Title</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Read Time</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-64 text-center">
                    <div className="flex flex-col items-center justify-center text-stone-400">
                      <Loader2 size={48} className="mb-4 animate-spin opacity-20" />
                      <p className="text-lg font-medium">Loading posts...</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filtered.length > 0 ? (
                filtered.map(post => (
                  <TableRow key={post.id}>
                    <TableCell>
                      <span className="font-semibold text-stone-900">{post.title}</span>
                      {post.excerpt && <p className="text-xs text-stone-500 mt-0.5 line-clamp-1">{post.excerpt}</p>}
                    </TableCell>
                    <TableCell><code className="text-xs text-stone-500">{post.slug}</code></TableCell>
                    <TableCell><Badge variant="outline" className="font-normal">{post.category}</Badge></TableCell>
                    <TableCell className="text-stone-600">{post.date}</TableCell>
                    <TableCell className="text-stone-600">{post.readTime} min</TableCell>
                    <TableCell>
                      {post.featured ? (
                        <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100"><Star size={12} className="mr-1" /> Featured</Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-stone-100 text-stone-500">Draft</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {hasPermission('blog', 'update') && (
                        <Button size="sm" variant="outline" className={cn('h-8', post.featured ? 'border-amber-300 text-amber-600 hover:bg-amber-50' : 'border-stone-200')} onClick={() => handleToggleFeatured(post)} disabled={togglingSlug === post.slug} title={post.featured ? 'Unmark featured' : 'Mark as featured'}>
                          {togglingSlug === post.slug ? <Loader2 size={14} className="animate-spin" /> : <Star size={14} className={post.featured ? 'fill-amber-400 text-amber-500' : ''} />}
                        </Button>
                        )}
                        {hasPermission('blog', 'update') && (
                        <Button size="sm" variant="outline" className="h-8 border-stone-200" onClick={() => openEdit(post)}>
                          <Edit3 size={14} className="mr-1" /> Edit
                        </Button>
                        )}
                        {hasPermission('blog', 'delete') && (
                        <Button size="sm" variant="outline" className="h-8 border-red-200 text-red-600 hover:bg-red-50" onClick={() => { if (confirm(`Delete post "${post.title}"? This removes it from the website.`)) handleDelete(post.slug); }} disabled={isDeleting === post.slug}>
                          {isDeleting === post.slug ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-stone-400">No blog posts found</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={v => { if (!v) { setIsDialogOpen(false); setEditingPost(null); } }}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPost ? 'Edit Blog Post' : 'Create Blog Post'}</DialogTitle>
            <DialogDescription>Fill in the details below. Fields marked * are required.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title *</Label>
                <Input id="title" name="title" placeholder="How Solar Energy is Transforming India" defaultValue={editingPost?.title || ''} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">Slug *</Label>
                <Input id="slug" name="slug" placeholder="how-solar-energy-transforming-india" defaultValue={editingPost?.slug || ''} required />
                <p className="text-[11px] text-stone-400">URL-friendly identifier, auto-generated from title</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select name="category" defaultValue={editingPost?.category || 'Educational'}>
                  <SelectTrigger id="category"><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="readTime">Read Time (minutes)</Label>
                <Input id="readTime" name="readTime" type="number" placeholder="5" defaultValue={editingPost?.readTime || 5} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="date">Publish Date</Label>
                <Input id="date" name="date" type="date" defaultValue={editingPost?.date || toLocalDateKey()} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="author">Author</Label>
                <Input id="author" name="author" placeholder="John Doe" defaultValue={typeof editingPost?.author === 'string' ? editingPost.author : (editingPost?.author?.name || '')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="heroImage">Hero Image URL</Label>
                <Input id="heroImage" name="heroImage" placeholder="https://example.com/image.jpg" defaultValue={editingPost?.heroImage || ''} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tags">Tags (comma separated)</Label>
                <Input id="tags" name="tags" placeholder="solar, energy, renewable" defaultValue={Array.isArray(editingPost?.tags) ? editingPost.tags.join(', ') : ''} />
              </div>
              <div className="col-span-2 space-y-2">
                <Label htmlFor="excerpt">Excerpt / Summary</Label>
                <Textarea id="excerpt" name="excerpt" placeholder="Brief description for preview cards..." className="resize-none" defaultValue={editingPost?.excerpt || ''} />
              </div>
              <div className="col-span-2 space-y-2">
                <Label htmlFor="content">Content (JSON array or plain text)</Label>
                <Textarea id="content" name="content" placeholder='[["heading", "Introduction"], ["paragraph", "Content here..."]]' className="font-mono text-xs min-h-[120px]" defaultValue={Array.isArray(editingPost?.content) ? JSON.stringify(editingPost.content, null, 2) : (typeof editingPost?.content === 'string' ? editingPost.content : '')} />
                <p className="text-[11px] text-stone-400">JSON array of blocks: ["heading", "text"] or ["paragraph", "text"]</p>
              </div>
              <div className="col-span-2 flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch id="featured" checked={featuredChecked} onCheckedChange={setFeaturedChecked} />
                  <Label htmlFor="featured">Featured Post</Label>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setIsDialogOpen(false); setEditingPost(null); }}>Cancel</Button>
              <Button type="submit" className="bg-orange-600 hover:bg-orange-700 text-white" disabled={saving}>
                {saving ? <Loader2 size={16} className="mr-2 animate-spin" /> : null}
                {editingPost ? 'Update Post' : 'Create Post'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BlogManagement;
