import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { 
  Globe, 
  Image as ImageIcon,
  MessageSquare,
  TrendingUp,
  Award,
  Users,
  Settings,
  Heart,
  Grid,
  ShieldCheck,
  Video as VideoIcon
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';

// Custom sub-managers imports
import ProjectsManager from '../components/admin/ProjectsManager';
import ProductsManager from '../components/admin/ProductsManager';
import GalleryManager from '../components/admin/GalleryManager';
import VideosManager from '../components/admin/VideosManager';
import ContactLeadsManager from '../components/admin/ContactLeadsManager';
import TestimonialsManager from '../components/admin/TestimonialsManager';
import StatsManager from '../components/admin/StatsManager';
import AmcPlansManager from '../components/admin/AmcPlansManager';
import TeamManager from '../components/admin/TeamManager';
import CertificationsManager from '../components/admin/CertificationsManager';
import SiteSettingsManager from '../components/admin/SiteSettingsManager';

const AdminPanel: React.FC = () => {
  // NOTE: Website CMS content global hai — ye page global region filter
  // (navbar pill) ko jaan-boojh ke ignore karta hai, hamesha all-regions data.
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => searchParams.get('tab') || 'leads');
  const [autoCreate, setAutoCreate] = useState(() => searchParams.get('new') === '1');

  useEffect(() => {
    if (!hasPermission('website', 'read')) {
      toast.error('Access denied');
      navigate('/');
      return;
    }
    if (autoCreate) {
      const t = setTimeout(() => setAutoCreate(false), 500);
      searchParams.delete('new');
      setSearchParams(searchParams, { replace: true });
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 tracking-tight">Website Content Management System (CMS)</h1>
          <p className="text-stone-500 text-sm">Update and adjust details on Eurosol Service public storefront platform</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-orange-600 font-semibold bg-orange-50 px-3 py-1.5 rounded-lg border border-orange-100">
          <Globe size={14} className="animate-spin" /> Link Connected to eurosolservice.com API
        </div>
      </div>

      {/* Main Tabbed Layout */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="w-full overflow-x-auto pb-1">
          <TabsList className="flex w-max space-x-1 border border-stone-200 bg-stone-100/80 p-1 rounded-lg">
            <TabsTrigger value="leads" className="text-xs">
              <MessageSquare size={12} className="mr-1.5" /> Leads & Inquiries
            </TabsTrigger>
            <TabsTrigger value="projects" className="text-xs">
              <Grid size={12} className="mr-1.5" /> Projects
            </TabsTrigger>
            <TabsTrigger value="products" className="text-xs">
              <ShieldCheck size={12} className="mr-1.5" /> Products
            </TabsTrigger>
            <TabsTrigger value="gallery" className="text-xs">
              <ImageIcon size={12} className="mr-1.5" /> Gallery
            </TabsTrigger>
            <TabsTrigger value="videos" className="text-xs">
              <VideoIcon size={12} className="mr-1.5" /> Videos
            </TabsTrigger>
            <TabsTrigger value="testimonials" className="text-xs">
              <Heart size={12} className="mr-1.5" /> Testimonials
            </TabsTrigger>
            <TabsTrigger value="stats" className="text-xs">
              <TrendingUp size={12} className="mr-1.5" /> Stats
            </TabsTrigger>
            <TabsTrigger value="amc" className="text-xs">
              <Award size={12} className="mr-1.5" /> AMC Plans
            </TabsTrigger>
            <TabsTrigger value="team" className="text-xs">
              <Users size={12} className="mr-1.5" /> Team
            </TabsTrigger>
            <TabsTrigger value="certifications" className="text-xs">
              <Award size={12} className="mr-1.5" /> Certs
            </TabsTrigger>
            <TabsTrigger value="settings" className="text-xs">
              <Settings size={12} className="mr-1.5" /> Settings
            </TabsTrigger>
          </TabsList>
        </div>

        {/* 1. Leads & Inquiries Tab */}
        <TabsContent value="leads">
          <ContactLeadsManager />
        </TabsContent>

        {/* 2. Projects Tab */}
        <TabsContent value="projects">
          <ProjectsManager autoCreate={autoCreate} />
        </TabsContent>

        {/* 3. Products Tab */}
        <TabsContent value="products">
          <ProductsManager />
        </TabsContent>

        {/* 4. Gallery Tab */}
        <TabsContent value="gallery">
          <GalleryManager autoCreate={autoCreate} />
        </TabsContent>

        {/* 5. Videos Tab */}
        <TabsContent value="videos">
          <VideosManager />
        </TabsContent>

        {/* 6. Testimonials Tab */}
        <TabsContent value="testimonials">
          <TestimonialsManager autoCreate={autoCreate} />
        </TabsContent>

        {/* 7. Stats Tab */}
        <TabsContent value="stats">
          <StatsManager />
        </TabsContent>

        {/* 8. AMC Plans Tab */}
        <TabsContent value="amc">
          <AmcPlansManager />
        </TabsContent>

        {/* 9. Team Tab */}
        <TabsContent value="team">
          <TeamManager autoCreate={autoCreate} />
        </TabsContent>

        {/* 10. Certifications Tab */}
        <TabsContent value="certifications">
          <CertificationsManager />
        </TabsContent>

        {/* 11. Settings Tab */}
        <TabsContent value="settings">
          <SiteSettingsManager />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminPanel;
