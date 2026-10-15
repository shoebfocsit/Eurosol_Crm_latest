import React, { useState, useEffect } from 'react';
import { 
  Building2, Phone, Mail, MapPin, Clock, ShieldCheck, RefreshCw, Loader2, Save, Globe 
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { webApi } from '../../services/api';
import { toast } from 'sonner';

const SiteSettingsManager: React.FC = () => {
  const [companyName, setCompanyName] = useState('');
  const [tagline, setTagline] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [workingHours, setWorkingHours] = useState('');
  const [instagramUrl, setInstagramUrl] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [facebookUrl, setFacebookUrl] = useState('');
  const [googleMapsEmbedUrl, setGoogleMapsEmbedUrl] = useState('');
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Load-fail guard (StatsManager wala hi incident): fetch fail ho to form
  // khaali dikhta hai — us state me Save dabane se live site config
  // blank se overwrite ho jayegi. Save sirf successful load ke baad.
  const [loadOk, setLoadOk] = useState(false);

  const fetchSettings = async () => {
    setIsLoading(true);
    try {
      const resp = await webApi.getSiteSettings();
      const s = resp.data.data?.settings || resp.data.data || resp.data;
      if (s) {
        setCompanyName(s.companyName || '');
        setTagline(s.tagline || '');
        setPhone(s.phone || '');
        setWhatsappNumber(s.whatsappNumber || '');
        setEmail(s.email || '');
        setAddress(s.address || '');
        setWorkingHours(s.workingHours || '');
        setInstagramUrl(s.instagramUrl || '');
        setYoutubeUrl(s.youtubeUrl || '');
        setFacebookUrl(s.facebookUrl || '');
        setGoogleMapsEmbedUrl(s.googleMapsEmbedUrl || '');
        setSeoTitle(s.seoTitle || '');
        setSeoDescription(s.seoDescription || '');
        setLoadOk(true);
      } else {
        setLoadOk(false);
      }
    } catch (err) {
      setLoadOk(false);
      toast.error('Failed to load global site configurations');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loadOk) {
      toast.error('Settings load nahi hui — pehle Retry dabao, warna live site blank ho jayegi');
      return;
    }
    setIsSubmitting(true);
    try {
      await webApi.updateSiteSettings({
        companyName,
        tagline,
        phone,
        whatsappNumber,
        email,
        address,
        workingHours,
        instagramUrl,
        youtubeUrl,
        facebookUrl,
        googleMapsEmbedUrl,
        seoTitle,
        seoDescription
      });
      toast.success('Site settings updated successfully!');
      fetchSettings();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error occurred saving site config');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="border-stone-200 shadow-sm max-w-4xl">
      <CardHeader className="p-4 border-b border-stone-100 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg font-bold">Global Site & SEO Settings</CardTitle>
          <CardDescription>Configure corporate contact parameters, map overlays, and search engine titles</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={fetchSettings} className="h-8 border-stone-200" disabled={isLoading}>
          <RefreshCw size={12} className={isLoading ? "animate-spin" : ""} />
        </Button>
      </CardHeader>
      <CardContent className="p-6">
        {!loadOk && !isLoading && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 flex items-center justify-between gap-3">
            <p className="text-xs text-red-800 font-medium">Live settings load nahi hui — Save band hai taaki site blank na ho jaye.</p>
            <Button variant="outline" size="sm" onClick={fetchSettings} className="h-8 border-red-200 text-red-700 shrink-0">
              <RefreshCw size={12} className="mr-1" /> Retry
            </Button>
          </div>
        )}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center p-12 text-stone-400">
            <Loader2 size={36} className="animate-spin mb-2" />
            <p>Loading details...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-stone-900 border-l-4 border-orange-600 pl-2">Corporate Profile</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-stone-700">Company Legal Name *</label>
                  <Input 
                    value={companyName} 
                    onChange={(e) => setCompanyName(e.target.value)} 
                    placeholder="e.g. Eurosol Service" 
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-stone-700">Tagline / Motto</label>
                  <Input 
                    value={tagline} 
                    onChange={(e) => setTagline(e.target.value)} 
                    placeholder="e.g. Empowering roofs with clean solar grids" 
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-stone-700">Support Phone *</label>
                  <Input 
                    value={phone} 
                    onChange={(e) => setPhone(e.target.value)} 
                    placeholder="+91 98765 43210" 
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-stone-700">WhatsApp Alert Number</label>
                  <Input 
                    value={whatsappNumber} 
                    onChange={(e) => setWhatsappNumber(e.target.value)} 
                    placeholder="e.g. 919876543210 with country code" 
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-stone-700">Corporate Email ID *</label>
                  <Input 
                    type="email"
                    value={email} 
                    onChange={(e) => setEmail(e.target.value)} 
                    placeholder="support@eurosolservice.com" 
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-stone-700">Office Working Hours</label>
                  <Input 
                    value={workingHours} 
                    onChange={(e) => setWorkingHours(e.target.value)} 
                    placeholder="e.g. Mon - Sat: 9:00 AM - 6:00 PM" 
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-stone-700">Office Address *</label>
                  <Input 
                    value={address} 
                    onChange={(e) => setAddress(e.target.value)} 
                    placeholder="123 Renewable Ave, Nagpur, MH, India" 
                    required
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-stone-100">
              <h3 className="text-sm font-bold text-stone-900 border-l-4 border-orange-600 pl-2">Social Platforms & Map Overlay</h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-stone-700">Instagram Handle URL</label>
                  <Input 
                    value={instagramUrl} 
                    onChange={(e) => setInstagramUrl(e.target.value)} 
                    placeholder="https://instagram.com/handle" 
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-stone-700">YouTube Channel URL</label>
                  <Input 
                    value={youtubeUrl} 
                    onChange={(e) => setYoutubeUrl(e.target.value)} 
                    placeholder="https://youtube.com/channel" 
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-stone-700">Facebook Page URL</label>
                  <Input 
                    value={facebookUrl} 
                    onChange={(e) => setFacebookUrl(e.target.value)} 
                    placeholder="https://facebook.com/page" 
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-stone-700">Google Maps Embed URL (Iframe src link)</label>
                <Input 
                  value={googleMapsEmbedUrl} 
                  onChange={(e) => setGoogleMapsEmbedUrl(e.target.value)} 
                  placeholder="https://www.google.com/maps/embed?pb=..." 
                />
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-stone-100">
              <h3 className="text-sm font-bold text-stone-900 border-l-4 border-orange-600 pl-2">Search Engine Optimization (SEO)</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-stone-700">Meta Title Tag *</label>
                  <Input 
                    value={seoTitle} 
                    onChange={(e) => setSeoTitle(e.target.value)} 
                    placeholder="e.g. Eurosol Service - Premium India Solar Installers" 
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-stone-700">Meta Description Tag *</label>
                  <Input 
                    value={seoDescription} 
                    onChange={(e) => setSeoDescription(e.target.value)} 
                    placeholder="e.g. Complete high-capacity residential rooftop maintenance and installation grids across central India." 
                    required
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-stone-100">
              <Button type="submit" className="bg-orange-600 hover:bg-orange-700 text-white gap-2 h-10 px-6" disabled={isSubmitting || !loadOk} title={loadOk ? 'Save configurations' : 'Pehle settings load hone do'}>
                {isSubmitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Saving Configurations...
                  </>
                ) : (
                  <>
                    <Save size={16} /> Save Configurations
                  </>
                )}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
};

export default SiteSettingsManager;
