import React, { useState, useEffect } from 'react';
import { 
  Plus, Edit2, Trash2, Award, FileImage, RefreshCw, Loader2 
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

interface Certification {
  id: string;
  name: string;
  issuedBy: string;
  description?: string;
  iconName?: string;
  isActive: boolean;
  imageUrl?: string;
}

const CertificationsManager: React.FC = () => {
  const [certs, setCerts] = useState<Certification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Dialog & Form states
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCert, setEditingCert] = useState<Certification | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form Field States
  const [name, setName] = useState('');
  const [issuedBy, setIssuedBy] = useState('');
  const [description, setDescription] = useState('');
  const [iconName, setIconName] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const fetchCerts = async () => {
    setIsLoading(true);
    try {
      const resp = await webApi.getCertifications();
      const data = resp.data.data?.certifications || resp.data.data || resp.data;
      setCerts(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error('Failed to fetch certifications');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCerts();
  }, []);

  const openCreateDialog = () => {
    setEditingCert(null);
    setName('');
    setIssuedBy('');
    setDescription('');
    setIconName('Award');
    setIsActive(true);
    setSelectedFile(null);
    setIsDialogOpen(true);
  };

  const openEditDialog = (cert: Certification) => {
    setEditingCert(cert);
    setName(cert.name || '');
    setIssuedBy(cert.issuedBy || '');
    setDescription(cert.description || '');
    setIconName(cert.iconName || 'Award');
    setIsActive(!!cert.isActive);
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
    if (!name.trim() || !issuedBy.trim()) {
      toast.error('Certification name and issuer are required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('name', name);
      formData.append('issuedBy', issuedBy);
      formData.append('description', description);
      formData.append('iconName', iconName);
      formData.append('isActive', String(isActive));

      if (selectedFile) {
        formData.append('image', selectedFile);
      }

      if (editingCert) {
        await webApi.updateCertification(editingCert.id, formData);
        toast.success('Certification saved!');
      } else {
        await webApi.createCertification(formData);
        toast.success('Certification created successfully!');
      }

      setIsDialogOpen(false);
      fetchCerts();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error occurred saving credential');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Remove this license or certification record?')) return;
    try {
      await webApi.deleteCertification(id);
      toast.success('Certification removed');
      fetchCerts();
    } catch (err) {
      toast.error('Failed to delete certification');
    }
  };

  return (
    <Card className="border-stone-200 shadow-sm">
      <CardHeader className="p-4 border-b border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <CardTitle className="text-lg font-bold">Certifications & Approvals</CardTitle>
          <CardDescription>Publish ISO, MNRE, or structural engineering documents to build customer trust</CardDescription>
        </div>
        <Button onClick={openCreateDialog} className="bg-orange-600 hover:bg-orange-700 text-white gap-2">
          <Plus size={16} /> Add Certification
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <div className="p-4 flex items-center justify-between">
          <span className="text-xs text-stone-500 font-semibold">{certs.length} certificates published</span>
          <Button variant="outline" size="sm" onClick={fetchCerts} className="h-8 text-xs border-stone-200">
            <RefreshCw size={12} className="mr-1.5" /> Reload List
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="bg-stone-50">
              <TableHead className="w-16">Preview</TableHead>
              <TableHead>Certificate Name</TableHead>
              <TableHead>Issued By</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center">
                  <div className="flex flex-col items-center justify-center text-stone-400">
                    <Loader2 size={24} className="animate-spin mb-1" />
                    <span>Loading files...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : certs.length > 0 ? (
              certs.map((cert) => (
                <TableRow key={cert.id}>
                  <TableCell>
                    {cert.imageUrl ? (
                      <AppImage 
                        src={cert.imageUrl} 
                        alt={cert.name} 
                        className="w-10 h-8 object-contain rounded border border-stone-100 bg-stone-50"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-10 h-8 bg-stone-100 rounded flex items-center justify-center text-stone-400 border border-stone-100">
                        <Award size={14} />
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-semibold text-stone-900">{cert.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="bg-orange-50 text-orange-600 border-none">
                      {cert.issuedBy}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-xs">
                    <p className="text-xs text-stone-600 truncate">{cert.description}</p>
                  </TableCell>
                  <TableCell>
                    {cert.isActive ? (
                      <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-none">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Hidden</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => openEditDialog(cert)} className="h-8 w-8 text-stone-600">
                        <Edit2 size={14} />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(cert.id)} className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50">
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-stone-400">
                  No certification files imported
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCert ? 'Edit Certification' : 'New Certification'}</DialogTitle>
            <DialogDescription>
              Submit licensing standards compliance metrics or approval cert sheets.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-stone-700">License/Certificate Name *</label>
              <Input 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                placeholder="e.g. MNRE Channel Partner Approval" 
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-stone-700">Issued By (Organization body) *</label>
              <Input 
                value={issuedBy} 
                onChange={(e) => setIssuedBy(e.target.value)} 
                placeholder="e.g. Ministry of New & Renewable Energy" 
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-stone-700">Icon / Design Name</label>
                <Input 
                  value={iconName} 
                  onChange={(e) => setIconName(e.target.value)} 
                  placeholder="e.g. Award, Shield, FileText" 
                />
              </div>

              <div className="space-y-2 flex flex-col justify-end">
                <div className="flex items-center gap-2 border border-stone-100 p-2.5 text-xs bg-stone-50 rounded-md">
                  <input 
                    type="checkbox" 
                    id="certActiveBtn"
                    checked={isActive} 
                    onChange={(e) => setIsActive(e.target.checked)} 
                    className="w-4 h-4 accent-orange-600 cursor-pointer"
                  />
                  <label htmlFor="certActiveBtn" className="font-semibold text-stone-700 cursor-pointer">Visible (Active)</label>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-stone-700">Short Description</label>
              <textarea
                className="w-full p-2 border border-stone-200 rounded-md text-sm h-20"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Write optional explanations about scope of certification..."
              />
            </div>

            <div className="space-y-1 border border-dashed border-stone-200 p-4 rounded-md flex flex-col items-center justify-center text-center">
              <FileImage className="text-stone-400 mb-1" size={24} />
              <span className="text-xs font-medium text-stone-600">Upload PDF Certification Image / Doc Logo</span>
              <input 
                type="file" 
                accept="image/*" 
                onChange={handleFileChange} 
                className="text-xs text-stone-600 mt-2"
              />
              {editingCert && !selectedFile && editingCert.imageUrl && (
                <p className="text-[10px] text-orange-600 font-medium mt-1">Keeps current uploaded logo file</p>
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
                  'Deploy Credential'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default CertificationsManager;
