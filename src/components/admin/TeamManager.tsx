import React, { useState, useEffect } from 'react';
import { 
  Plus, Search, Edit2, Trash2, User, Linkedin, FileImage, RefreshCw, Loader2 
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

interface TeamMember {
  id: string;
  name: string;
  role: string;
  imageUrl?: string;
  linkedinUrl?: string;
  displayOrder: number;
}

interface TeamManagerProps {
  autoCreate?: boolean;
}

const TeamManager: React.FC<TeamManagerProps> = ({ autoCreate }) => {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Dialog & Form states
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (autoCreate) {
      setEditingMember(null);
      setIsDialogOpen(true);
    }
  }, [autoCreate]);

  // Form Field States
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [displayOrder, setDisplayOrder] = useState<number>(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const fetchTeam = async () => {
    setIsLoading(true);
    try {
      const resp = await webApi.getTeam();
      const data = resp.data.data?.team || resp.data.data?.members || resp.data.data || resp.data;
      setMembers(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error('Failed to fetch team members');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTeam();
  }, []);

  const openCreateDialog = () => {
    setEditingMember(null);
    setName('');
    setRole('');
    setLinkedinUrl('');
    setDisplayOrder(members.length + 1);
    setSelectedFile(null);
    setIsDialogOpen(true);
  };

  const openEditDialog = (member: TeamMember) => {
    setEditingMember(member);
    setName(member.name || '');
    setRole(member.role || '');
    setLinkedinUrl(member.linkedinUrl || '');
    setDisplayOrder(member.displayOrder || 0);
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
    if (!name.trim() || !role.trim()) {
      toast.error('Name & Role are required fields');
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('name', name);
      formData.append('role', role);
      formData.append('linkedinUrl', linkedinUrl);
      formData.append('displayOrder', String(displayOrder));

      if (selectedFile) {
        formData.append('image', selectedFile);
      }

      if (editingMember) {
        await webApi.updateTeamMember(editingMember.id, formData);
        toast.success('Team member updated successfully!');
      } else {
        await webApi.createTeamMember(formData);
        toast.success('Team member added successfully!');
      }

      setIsDialogOpen(false);
      fetchTeam();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error saving team member');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to remove this team member?')) return;
    try {
      await webApi.deleteTeamMember(id);
      toast.success('Member removed from team portfolio');
      fetchTeam();
    } catch (err) {
      toast.error('Failed to remove team member');
    }
  };

  return (
    <Card className="border-stone-200 shadow-sm">
      <CardHeader className="p-4 border-b border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <CardTitle className="text-lg font-bold">Public Web Team Members</CardTitle>
          <CardDescription>Manages staff, designations, and social profiles appearing on the About Us page</CardDescription>
        </div>
        <Button onClick={openCreateDialog} className="bg-orange-600 hover:bg-orange-700 text-white gap-2">
          <Plus size={16} /> Add Member
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <div className="p-4 flex items-center justify-between">
          <span className="text-xs text-stone-500 font-semibold">{members.length} leaders published</span>
          <Button variant="outline" size="sm" onClick={fetchTeam} className="h-8 text-xs border-stone-200">
            <RefreshCw size={12} className="mr-1.5" /> Sync List
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="bg-stone-50">
              <TableHead className="w-16">Profile</TableHead>
              <TableHead>Full Name</TableHead>
              <TableHead>Designation / Role</TableHead>
              <TableHead>Social Link</TableHead>
              <TableHead>Display Order</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center">
                  <div className="flex flex-col items-center justify-center text-stone-400">
                    <Loader2 size={24} className="animate-spin mb-1" />
                    <span>Loading roster...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : members.length > 0 ? (
              members.map((member) => (
                <TableRow key={member.id}>
                  <TableCell>
                    {member.imageUrl ? (
                      <AppImage 
                        src={member.imageUrl} 
                        alt={member.name} 
                        className="w-10 h-10 rounded-full object-cover border border-stone-100"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center text-stone-400 border border-stone-100">
                        <User size={16} />
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-semibold text-stone-900">{member.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-medium text-[11px]">
                      {member.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {member.linkedinUrl ? (
                      <a 
                        href={member.linkedinUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 flex items-center gap-1 hover:underline text-xs"
                      >
                        <Linkedin size={12} /> Contact Page
                      </a>
                    ) : (
                      <span className="text-xs text-stone-450">-</span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{member.displayOrder}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => openEditDialog(member)} className="h-8 w-8 text-stone-600">
                        <Edit2 size={14} />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(member.id)} className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50">
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-stone-400">
                  No public team members configured
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingMember ? 'Edit Team Profile' : 'Add Team Member'}</DialogTitle>
            <DialogDescription>
              Submit photos and titles to showcase the talent powering installations.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-stone-700">Full Name *</label>
              <Input 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                placeholder="e.g. Arjun Mehta" 
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-stone-700">Role / Title *</label>
                <Input 
                  value={role} 
                  onChange={(e) => setRole(e.target.value)} 
                  placeholder="e.g. Lead Solar Engineer" 
                  required
                />
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
              <label className="text-xs font-semibold text-stone-700">LinkedIn Profile URL</label>
              <Input 
                value={linkedinUrl} 
                onChange={(e) => setLinkedinUrl(e.target.value)} 
                placeholder="https://linkedin.com/in/username" 
              />
            </div>

            <div className="space-y-1 border border-dashed border-stone-200 p-4 rounded-md flex flex-col items-center justify-center text-center">
              <FileImage className="text-stone-400 mb-1" size={24} />
              <span className="text-xs font-medium text-stone-600">Select Profile PNG/JPG</span>
              <input 
                type="file" 
                accept="image/*" 
                onChange={handleFileChange} 
                className="text-xs text-stone-600 mt-2"
              />
              {editingMember && !selectedFile && editingMember.imageUrl && (
                <p className="text-[10px] text-orange-600 font-medium mt-1">Keeps current display image</p>
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
                  'Deploy Member'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default TeamManager;
