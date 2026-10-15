import React, { useState, useEffect } from 'react';
import { 
  BarChart3, ShieldCheck, Home, Globe, RefreshCw, Loader2, Save 
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { webApi } from '../../services/api';
import { toast } from 'sonner';

const StatsManager: React.FC = () => {
  const [panelsInstalled, setPanelsInstalled] = useState<number>(0);
  const [homesPowered, setHomesPowered] = useState<number>(0);
  const [yearsExperience, setYearsExperience] = useState<number>(0);
  const [citiesServing, setCitiesServing] = useState<number>(0);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Load-fail guard: fetch fail ho to form me 0 dikhta hai — us state me
  // Save dabane se asli live numbers 0 se overwrite ho jate hain (prod
  // homepage banners!). Save sirf successful load ke baad enabled.
  const [loadOk, setLoadOk] = useState(false);

  const fetchStats = async () => {
    setIsLoading(true);
    try {
      const resp = await webApi.getStats();
      const data = resp.data.data || resp.data;
      if (data) {
        setPanelsInstalled(data.panelsInstalled || 0);
        setHomesPowered(data.homesPowered || 0);
        setYearsExperience(data.yearsExperience || 0);
        setCitiesServing(data.citiesServing || 0);
        setLoadOk(true);
      } else {
        setLoadOk(false);
      }
    } catch (err) {
      setLoadOk(false);
      toast.error('Failed to load public site stats');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loadOk) {
      toast.error('Stats load nahi hue — pehle Retry dabao, warna live numbers 0 ho jayenge');
      return;
    }
    setIsSubmitting(true);
    try {
      await webApi.updateStats({
        panelsInstalled,
        homesPowered,
        yearsExperience,
        citiesServing
      });
      toast.success('Public website metrics updated successfully!');
      fetchStats();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error updating metrics');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="border-stone-200 shadow-sm max-w-2xl">
      <CardHeader className="p-4 border-b border-stone-100 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg font-bold">Public Site Stats & Achievements</CardTitle>
          <CardDescription>Configure the live achievement metrics shown across the homepage banners</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={fetchStats} className="h-8 border-stone-200" disabled={isLoading}>
          <RefreshCw size={12} className={isLoading ? "animate-spin" : ""} />
        </Button>
      </CardHeader>
      <CardContent className="p-6">
        {!loadOk && !isLoading && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 flex items-center justify-between gap-3">
            <p className="text-xs text-red-800 font-medium">Live stats load nahi hue — Save band hai taaki homepage numbers 0 na ho jayen.</p>
            <Button variant="outline" size="sm" onClick={fetchStats} className="h-8 border-red-200 text-red-700 shrink-0">
              <RefreshCw size={12} className="mr-1" /> Retry
            </Button>
          </div>
        )}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center p-12 text-stone-400">
            <Loader2 size={36} className="animate-spin mb-2" />
            <p>Fetching active records...</p>
          </div>
        ) : (
          <form onSubmit={handleUpdate} className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2 p-4 border border-stone-200 rounded-lg bg-stone-50/50 flex flex-col gap-1">
                <div className="flex items-center gap-2 text-stone-700">
                  <BarChart3 size={16} className="text-orange-600" />
                  <span className="text-xs font-semibold">Panels Installed *</span>
                </div>
                <Input 
                  type="number" 
                  value={panelsInstalled} 
                  onChange={(e) => setPanelsInstalled(Number(e.target.value))} 
                  className="font-bold text-lg border-stone-200 bg-card"
                  required
                />
                <span className="text-[10px] text-stone-400">Total number of solar modules shipped & bolted.</span>
              </div>

              <div className="space-y-2 p-4 border border-stone-200 rounded-lg bg-stone-50/50 flex flex-col gap-1">
                <div className="flex items-center gap-2 text-stone-700">
                  <Home size={16} className="text-orange-600" />
                  <span className="text-xs font-semibold">Homes Powered *</span>
                </div>
                <Input 
                  type="number" 
                  value={homesPowered} 
                  onChange={(e) => setHomesPowered(Number(e.target.value))} 
                  className="font-bold text-lg border-stone-200 bg-card"
                  required
                />
                <span className="text-[10px] text-stone-400">Number of operational roofs/families served.</span>
              </div>

              <div className="space-y-2 p-4 border border-stone-200 rounded-lg bg-stone-50/50 flex flex-col gap-1">
                <div className="flex items-center gap-2 text-stone-700">
                  <ShieldCheck size={16} className="text-orange-600" />
                  <span className="text-xs font-semibold">Years of Experience *</span>
                </div>
                <Input 
                  type="number" 
                  value={yearsExperience} 
                  onChange={(e) => setYearsExperience(Number(e.target.value))} 
                  className="font-bold text-lg border-stone-200 bg-card"
                  required
                />
                <span className="text-[10px] text-stone-400">Years of operation in solar design or installation.</span>
              </div>

              <div className="space-y-2 p-4 border border-stone-200 rounded-lg bg-stone-50/50 flex flex-col gap-1">
                <div className="flex items-center gap-2 text-stone-700">
                  <Globe size={16} className="text-orange-600" />
                  <span className="text-xs font-semibold">Cities Serving *</span>
                </div>
                <Input 
                  type="number" 
                  value={citiesServing} 
                  onChange={(e) => setCitiesServing(Number(e.target.value))} 
                  className="font-bold text-lg border-stone-200 bg-card"
                  required
                />
                <span className="text-[10px] text-stone-400">Total number of operational municipal boundaries.</span>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-stone-100">
              <Button type="submit" className="bg-orange-600 hover:bg-orange-700 text-white gap-2 h-10 px-5" disabled={isSubmitting || !loadOk} title={loadOk ? 'Save changes' : 'Pehle stats load hone do'}>
                {isSubmitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Saving...
                  </>
                ) : (
                  <>
                    <Save size={16} /> Save Changes
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

export default StatsManager;
