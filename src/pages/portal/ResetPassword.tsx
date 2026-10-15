import React, { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Sun, CheckCircle2 } from 'lucide-react';
import { authApi } from '../../services/api';
import { toast } from 'sonner';

// Consumes the ?token= link sent by POST /auth/forgot-password.
// Wires authApi.resetPassword which previously had no UI.
const ResetPassword: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) { toast.error('Reset link invalid hai — dobara link mangwao'); return; }
    if (password.length < 6) { toast.error('Password kam se kam 6 characters'); return; }
    if (password !== confirm) { toast.error('Passwords match nahi ho rahe'); return; }
    setLoading(true);
    try {
      await authApi.resetPassword({ token, password });
      setDone(true);
      toast.success('Password reset ho gaya — ab login karo');
    } catch (err: any) {
      const raw = err?.response?.data?.message || 'Reset failed — link expire ho sakta hai';
      toast.error(Array.isArray(raw) ? raw.join(', ') : raw);
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4"><div className="w-12 h-12 bg-orange-600 rounded-xl flex items-center justify-center"><Sun size={28} className="text-white" /></div></div>
          <CardTitle className="text-2xl">Set New Password</CardTitle>
          <CardDescription>Apna naya password banao</CardDescription>
        </CardHeader>
        <CardContent>
          {done ? (
            <div className="text-center space-y-4">
              <CheckCircle2 size={48} className="mx-auto text-green-500" />
              <p className="text-green-700 font-medium">Password reset successful!</p>
              <Button className="w-full bg-orange-600 hover:bg-orange-700 text-white" onClick={() => navigate('/portal/login')}>Go to Login</Button>
            </div>
          ) : !token ? (
            <div className="text-center space-y-4">
              <p className="text-sm text-stone-500">Reset link me token nahi mila. Email se pura link kholo ya naya link mangwao.</p>
              <Link to="/portal/forgot-password" className="text-orange-600 hover:underline text-sm block">Request new link</Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2"><Label>New Password</Label><Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 6 characters" required /></div>
              <div className="space-y-2"><Label>Confirm Password</Label><Input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Dobara likho" required /></div>
              <Button type="submit" className="w-full bg-orange-600 hover:bg-orange-700 text-white" disabled={loading}>
                {loading ? 'Saving...' : 'Reset Password'}
              </Button>
              <p className="text-center text-sm text-stone-500"><Link to="/portal/login" className="text-orange-600 hover:underline">Back to Login</Link></p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ResetPassword;
