import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Globe, Sun, AlertCircle, ArrowRight, CheckCircle2, ShieldCheck, Zap, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation
    if (!email || !password) {
      setError('Please enter both email and password');
      toast.error('Missing credentials');
      return;
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address');
      toast.error('Invalid email format');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const result = await login(email, password);
      if (result.success) {
        toast.success('Login successful! Welcome back.');
        // Navigation is handled by the effect above (routes CUSTOMERs to the portal)
      } else {
        setError(result.message || 'Invalid email or password');
        toast.error(result.message || 'Login failed');
      }
    } catch (err: any) {
      console.error('Login error:', err);
      const errorMessage = err.response?.data?.message || 'An unexpected error occurred. Please try again.';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-card overflow-hidden">
      {/* Left Side: Brand & Visuals (Hidden on mobile, visible on lg) */}
      <motion.div 
        initial={{ x: -100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="hidden lg:flex lg:w-1/2 bg-stone-900 relative overflow-hidden flex-col justify-between p-12 text-white"
      >
        {/* Background Decorative Elements */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none opacity-20">
          <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] rounded-full bg-orange-600 blur-[120px]" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-blue-600 blur-[120px]" />
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-12">
            <div className="w-10 h-10 bg-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-orange-600/20">
              <Sun size={24} className="text-white" />
            </div>
            <span className="text-2xl font-bold tracking-tight">SolarCRM</span>
          </div>

          <div className="space-y-6 max-w-lg">
            <motion.h1 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.6 }}
              className="text-5xl xl:text-6xl font-bold leading-[1.1] tracking-tight"
            >
              Powering the <span className="text-orange-500">Future</span> of Solar Management.
            </motion.h1>
            <motion.p 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.6 }}
              className="text-lg text-stone-400 leading-relaxed"
            >
              The all-in-one platform for solar companies to manage leads, site surveys, installations, and service requests with precision.
            </motion.p>
          </div>
        </div>

        <div className="relative z-10 grid grid-cols-2 gap-8">
          <div className="flex items-start gap-3">
            <div className="mt-1 p-1 rounded-full bg-orange-500/10 text-orange-500">
              <ShieldCheck size={18} />
            </div>
            <div>
              <p className="font-semibold">Role-Based Access</p>
              <p className="text-sm text-stone-500">Secure access for every team member.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="mt-1 p-1 rounded-full bg-blue-500/10 text-blue-500">
              <Zap size={18} />
            </div>
            <div>
              <p className="font-semibold">Real-time Tracking</p>
              <p className="text-sm text-stone-500">Monitor installations as they happen.</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Right Side: Login Form */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8 bg-stone-50">
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-md"
        >
          {/* Mobile Brand Header */}
          <div className="lg:hidden flex flex-col items-center gap-3 mb-8">
            <div className="w-16 h-16 rounded-full bg-orange-600 flex items-center justify-center overflow-hidden ring-4 ring-orange-100">
              <img src="/favicon.svg" alt="SolarCRM logo" className="w-10 h-10" draggable={false} />
            </div>
            <div className="text-center">
              <h1 className="text-2xl font-bold text-stone-900">Solar CRM</h1>
              <p className="text-stone-500 text-sm mt-1">Manage your solar projects with ease</p>
            </div>
          </div>

          <Card className="border-stone-200 shadow-xl shadow-stone-200/60 rounded-2xl">
            <CardHeader className="pt-8 sm:pt-10 pb-2 text-center space-y-2">
              <CardTitle className="text-2xl font-bold tracking-tight text-stone-900">Welcome Back</CardTitle>
              <CardDescription className="text-sm text-stone-500">
                Enter your credentials to access your workspace
              </CardDescription>
            </CardHeader>

            <CardContent className="p-6 sm:p-8 pt-5">
              <form onSubmit={handleSubmit} noValidate className="space-y-5">
                {error && (
                  <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="flex items-center justify-center gap-2 p-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl"
                  >
                    <AlertCircle size={16} className="shrink-0" />
                    <span>{error}</span>
                  </motion.div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-stone-700 font-medium">Email Address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" size={18} />
                    <Input
                      id="email"
                      type="email"
                      placeholder="name@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="h-12 pl-11 pr-4 rounded-xl border-stone-200 focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 transition-all"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-stone-700 font-medium">Password</Label>
                    <a href="/portal/forgot-password" className="text-xs font-semibold text-orange-600 hover:text-orange-700 transition-colors">Forgot password?</a>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" size={18} />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="h-12 pl-11 pr-11 rounded-xl border-stone-200 focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(s => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 transition-colors"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full h-12 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-semibold text-base shadow-lg shadow-orange-600/20 transition-all active:scale-[0.98]"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Signing in...</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2">
                      <span>Sign In</span>
                      <ArrowRight size={18} />
                    </div>
                  )}
                </Button>
              </form>
            </CardContent>

            <CardFooter className="px-6 sm:px-8 pb-8 pt-0">
              <p className="w-full text-center text-sm text-stone-500">
                Don't have an account? <a href="#" className="font-semibold text-orange-600 hover:underline">Contact Administrator</a>
              </p>
            </CardFooter>
          </Card>
        </motion.div>
      </div>
    </div>
  );
};

export default LoginPage;
