import React, { useState, useEffect } from 'react';
import { 
  Plus, Search, Edit2, Trash2, Globe, FileImage, ExternalLink, Loader2 
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

interface Project {
  id: string;
  name: string;
  type: 'Residential' | 'Commercial' | 'Industrial';
  location: string;
  size: string;
  date: string;
  description: string;
  isHighlighted: boolean;
  imageUrl?: string;
}

interface ProjectsManagerProps {
  autoCreate?: boolean;
}

const ProjectsManager: React.FC<ProjectsManagerProps> = ({ autoCreate }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  // Dialog states
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (autoCreate) {
      setEditingProject(null);
      setIsDialogOpen(true);
    }
  }, [autoCreate]);

  // Form states
  const [name, setName] = useState('');
  const [type, setType] = useState<'Residential' | 'Commercial' | 'Industrial'>('Residential');
  const [location, setLocation] = useState('');
  const [size, setSize] = useState('');
  const [date, setDate] = useState('');
  const [description, setDescription] = useState('');
  const [isHighlighted, setIsHighlighted] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const fetchProjects = async () => {
    setIsLoading(true);
    try {
      const resp = await webApi.getProjects(
        typeFilter !== 'all' ? { type: typeFilter } : undefined
      );
      // Backend nested form is response.data.data?.projects or response.data.data
      const data = resp.data.data?.projects || resp.data.data || resp.data;
      setProjects(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast.error('Failed to fetch projects');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, [typeFilter]);

  const openCreateDialog = () => {
    setEditingProject(null);
    setName('');
    setType('Residential');
    setLocation('');
    setSize('');
    setDate('');
    setDescription('');
    setIsHighlighted(false);
    setSelectedFile(null);
    setIsDialogOpen(true);
  };

  const openEditDialog = (proj: Project) => {
    setEditingProject(proj);
    setName(proj.name || '');
    setType(proj.type || 'Residential');
    setLocation(proj.location || '');
    setSize(proj.size || '');
    setDate(proj.date || '');
    setDescription(proj.description || '');
    setIsHighlighted(!!proj.isHighlighted);
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
      toast.error('Project Name is required');
      return;
    }
    // Backend create DTO me ye required hain — khaali bhejne par 400 aata
    // hai, isliye pehle hi roko (server ka raw message confusing lagta hai).
    if (!location.trim()) {
      toast.error('Location is required');
      return;
    }
    if (!size.trim()) {
      toast.error('Capacity / Size is required');
      return;
    }
    if (!date.trim()) {
      toast.error('Completion Date is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('name', name);
      formData.append('type', type);
      formData.append('location', location);
      formData.append('size', size);
      formData.append('date', date);
      formData.append('description', description);
      formData.append('isHighlighted', String(isHighlighted));
      
      if (selectedFile) {
        formData.append('image', selectedFile);
      }

      if (editingProject) {
        await webApi.updateProject(editingProject.id, formData);
        toast.success('Project updated successfully!');
      } else {
        await webApi.createProject(formData);
        toast.success('Project created successfully!');
      }

      setIsDialogOpen(false);
      fetchProjects();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error saving project');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this project?')) return;
    try {
      await webApi.deleteProject(id);
      toast.success('Project deleted successfully!');
      fetchProjects();
    } catch (err: any) {
      toast.error('Failed to delete project');
    }
  };

  const filteredProjects = projects.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.location.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Card className="border-stone-200 shadow-sm">
      <CardHeader className="p-4 border-b border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <CardTitle className="text-lg font-bold">Web Projects Portfolio</CardTitle>
          <CardDescription>Manages the portfolio section on the public website</CardDescription>
        </div>
        <Button onClick={openCreateDialog} className="bg-orange-600 hover:bg-orange-700 text-white gap-2">
          <Plus size={16} /> Add Project
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
            <Input 
              placeholder="Search projects by name or location..." 
              className="pl-10 h-10 border-stone-200"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-stone-500 font-medium">Type:</span>
            <select
              className="h-10 border border-stone-200 rounded-md px-3 text-sm bg-card"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="all">All Types</option>
              <option value="Residential">Residential</option>
              <option value="Commercial">Commercial</option>
              <option value="Industrial">Industrial</option>
            </select>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="bg-stone-50">
              <TableHead className="w-20">Preview</TableHead>
              <TableHead>Project Info</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Location & Size</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-48 text-center">
                  <div className="flex flex-col items-center justify-center text-stone-400">
                    <Loader2 size={32} className="animate-spin mb-2" />
                    <span>Loading projects...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredProjects.length > 0 ? (
              filteredProjects.map((proj) => (
                <TableRow key={proj.id}>
                  <TableCell>
                    {proj.imageUrl ? (
                      <AppImage 
                        src={proj.imageUrl} 
                        alt={proj.name} 
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
                      <h4 className="font-semibold text-stone-900">{proj.name}</h4>
                      <p className="text-xs text-stone-500 line-clamp-1">{proj.description}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{proj.type}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="text-xs">
                      <p className="font-medium text-stone-900">{proj.location}</p>
                      <p className="text-stone-500">{proj.size} • {proj.date}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    {proj.isHighlighted ? (
                      <Badge className="bg-orange-100 text-orange-700 border-none">Featured</Badge>
                    ) : (
                      <Badge variant="secondary">Standard</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => openEditDialog(proj)} className="h-8 w-8 text-stone-600">
                        <Edit2 size={14} />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(proj.id)} className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50">
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-stone-400">
                  No projects found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingProject ? 'Edit Project' : 'Add New Project'}</DialogTitle>
            <DialogDescription>
              Fill out the details below to publish this project to the public portfolio.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-stone-700">Project Name *</label>
              <Input 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                placeholder="e.g. BrightHome 5kW Rooftop Solar" 
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-stone-700">Project Type *</label>
                <select
                  className="w-full h-10 border border-stone-200 rounded-md px-3 text-sm bg-card"
                  value={type}
                  onChange={(e) => setType(e.target.value as any)}
                >
                  <option value="Residential">Residential</option>
                  <option value="Commercial">Commercial</option>
                  <option value="Industrial">Industrial</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-stone-700">Capacity / Size *</label>
                <Input 
                  value={size} 
                  onChange={(e) => setSize(e.target.value)} 
                  placeholder="e.g. 5 kW or 150 kW" 
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-stone-700">Location *</label>
                <Input 
                  value={location} 
                  onChange={(e) => setLocation(e.target.value)} 
                  placeholder="e.g. Satellite, Ahmedabad" 
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-stone-700">Completion Date *</label>
                <Input 
                  value={date} 
                  onChange={(e) => setDate(e.target.value)} 
                  placeholder="e.g. April 2026" 
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-stone-700">Description</label>
              <textarea
                className="w-full p-2 border border-stone-200 rounded-md text-sm h-20"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Provide a detailed description of the project, solar modules used, etc."
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between border border-stone-100 p-2.5 rounded-md bg-stone-50">
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-stone-700">Highlight Project</span>
                  <span className="text-[10px] text-stone-500">Feature this project in the front row on home page</span>
                </div>
                <input 
                  type="checkbox" 
                  checked={isHighlighted} 
                  onChange={(e) => setIsHighlighted(e.target.checked)} 
                  className="w-4 h-4 accent-orange-600 rounded"
                />
              </div>
            </div>

            <div className="space-y-1 border border-dashed border-stone-200 p-4 rounded-md flex flex-col items-center justify-center text-center">
              <FileImage className="text-stone-400 mb-1" size={24} />
              <span className="text-xs font-medium text-stone-600">Project Cover Image</span>
              <span className="text-[10px] text-stone-400 mb-2">JPG, PNG up to 5MB</span>
              <input 
                type="file" 
                accept="image/*" 
                onChange={handleFileChange} 
                className="text-xs text-stone-600"
              />
              {editingProject && !selectedFile && editingProject.imageUrl && (
                <p className="text-[10px] text-orange-600 font-medium mt-1">Keeps current image if file not selected</p>
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
                  'Save Project'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default ProjectsManager;
