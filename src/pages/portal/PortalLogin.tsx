import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Sun, AlertCircle, ArrowRight } from 'lucide-react';
import { customerAuthApi } from '../../services/api';
import { safeStorage } from '../../lib/storage';
import { toast } from 'sonner';

const PortalLogin: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError('Enter email and password'); return; }
    setLoading(true); setError('');
    try {
      const res = await customerAuthApi.login({ email, password });
      const d = res.data;
      const payload = d?.data || d;
      const token = payload?.accessToken || payload?.access_token || payload?.token || d?.accessToken || d?.access_token || d?.token;
      const refreshToken = payload?.refreshToken || payload?.refresh_token || d?.refreshToken || d?.refresh_token;
      const user = payload?.user || d?.user;
      if (token) {
        safeStorage.setItem('portal_token', token);
        if (user) safeStorage.setItem('portal_user', JSON.stringify(user));
        else safeStorage.removeItem('portal_user');
        if (refreshToken) safeStorage.setItem('portal_refresh_token', refreshToken);
        else safeStorage.removeItem('portal_refresh_token');
        toast.success('Login successful');
        navigate('/portal/profile');
      } else {
        setError(d?.message || payload?.message || 'Login failed');
      }
    } catch (err: any) {
      const status = err?.response?.status;
      const msg = err?.response?.data?.message || 'Invalid credentials';
      // Backend has no /auth/customer/* routes deployed yet — a 404 here means
      // the portal backend is missing, not wrong credentials.
      setError(status === 404 ? 'Customer portal is not available yet — please contact the Eurosol team.' : msg);
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4"><div className="w-12 h-12 bg-orange-600 rounded-xl flex items-center justify-center"><Sun size={28} className="text-white" /></div></div>
          <CardTitle className="text-2xl">Customer Portal</CardTitle>
          <CardDescription>Sign in with your customer account</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="flex items-center gap-2 p-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg"><AlertCircle size={16} /><span>{error}</span></div>}
            <div className="space-y-2"><Label>Email</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required /></div>
            <div className="space-y-2"><Label>Password</Label><Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required /></div>
            <Button type="submit" className="w-full bg-orange-600 hover:bg-orange-700 text-white" disabled={loading}>
              {loading ? <span className="flex items-center gap-2"><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Signing in...</span> : <span className="flex items-center justify-center gap-2">Sign In <ArrowRight size={18} /></span>}
            </Button>
          </form>
          <p className="text-center text-sm text-stone-500 mt-4"><Link to="/portal/forgot-password" className="text-orange-600 hover:underline">Forgot Password?</Link></p>
        </CardContent>
      </Card>
    </div>
  );
};

export default PortalLogin;
