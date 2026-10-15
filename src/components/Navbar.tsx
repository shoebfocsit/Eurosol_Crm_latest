import React, { useState, useEffect } from 'react';
import { Bell, Search, Menu, User as UserIcon, MapPin, Loader2, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useRegion } from '../contexts/RegionContext';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { notificationsApi } from '../services/api';
import { resolveImageUrl } from '@/lib/utils';
import { toast } from 'sonner';
import ProfileCard from './ProfileCard';

interface NavbarProps {
  toggleSidebar: () => void;
}

const Navbar: React.FC<NavbarProps> = ({ toggleSidebar }) => {
  const { user, logout } = useAuth();
  const { regions, selectedRegion, setSelectedRegion } = useRegion();
  const isRegionFiltered = selectedRegion !== 'all';
  const navigate = useNavigate();
  const [navSearch, setNavSearch] = useState('');
  const submitNavSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = navSearch.trim();
    if (!q) return;
    setNavSearch('');
    navigate(`/leads?q=${encodeURIComponent(q)}`);
  };
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showProfileCard, setShowProfileCard] = useState(false);

  const fetchNotifications = async () => {
    try {
      const response = await notificationsApi.getAll();
      const rawData = response.data?.data;
      const notificationsData = Array.isArray(rawData) 
        ? rawData 
        : Array.isArray(rawData?.notifications)
        ? rawData.notifications
        : Array.isArray(response.data)
        ? response.data
        : [];
      setNotifications(notificationsData);
      setUnreadCount(notificationsData.filter((n: any) => !n.isRead).length);
    } catch (error) {
      console.error('Failed to fetch notifications', error);
    }
  };

  useEffect(() => {
    if (user) {
      fetchNotifications();
      const interval = setInterval(() => {
        if (!document.hidden) fetchNotifications();
      }, 60000); // Poll every minute (paused while tab hidden)

      return () => clearInterval(interval);
    }
  }, [user]);

  const handleMarkAsRead = async (id: string) => {
    try {
      await notificationsApi.markAsRead(id);
      fetchNotifications();
    } catch (error) {
      console.error('Failed to mark notification as read', error);
      toast.error('Could not mark notification as read');
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationsApi.markAllRead();
      fetchNotifications();
      toast.success('All notifications marked as read');
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Could not mark all as read');
    }
  };

  const renderRegionBadges = () => {
    const regions = user?.regions || user?.region;
    const list = Array.isArray(regions) ? regions : regions ? [regions] : [];
    const visible = list.slice(0, 2);
    const extra = list.length - visible.length;
    return (
      <>
        {visible.map((reg: any, i: number) => (
          <Badge key={typeof reg === 'object' ? reg.id || i : i} variant="outline" className="flex items-center gap-1 bg-stone-50 text-stone-600 border-stone-200 max-w-24">
            <MapPin size={12} className="shrink-0" />
            <span className="truncate">{typeof reg === 'object' ? reg.name : reg}</span>
          </Badge>
        ))}
        {extra > 0 && (
          <Badge variant="outline" className="flex items-center gap-1 bg-stone-50 text-stone-600 border-stone-200 shrink-0">
            +{extra}
          </Badge>
        )}
      </>
    );
  };

  return (
    <header className="sticky top-0 z-30 h-16 px-4 bg-card border-b border-stone-200 grid grid-cols-[1fr_auto_1fr] items-center">
      <div className="flex items-center gap-4 min-w-0">
        <Button variant="ghost" size="icon" onClick={toggleSidebar} data-sidebar-toggle className="text-stone-600 shrink-0">
          <Menu size={20} />
        </Button>
        
        <div className="hidden md:flex items-center gap-2 min-w-0">
          {renderRegionBadges()}
        </div>

        {/* Global region filter — har tab me dikhta hai. Admin-panel (CMS)
            isko ignore karta hai; baaki saare tabs isi region ka data dikhate hain. */}
        <div className="hidden sm:flex items-center gap-1.5 pl-2 ml-1 border-l border-stone-200 shrink-0">
          <MapPin size={14} className={isRegionFiltered ? 'text-orange-600' : 'text-stone-400'} />
          <Select value={selectedRegion} onValueChange={setSelectedRegion}>
            <SelectTrigger
              aria-label="Filter by region"
              title={isRegionFiltered ? 'Region filter active — saare tabs isi region ka data dikha rahe hain' : 'All regions ka data'}
              className={`h-8 text-xs font-semibold rounded-full w-[132px] lg:w-[160px] ${
                isRegionFiltered
                  ? 'bg-orange-600 text-white border-orange-600 shadow-sm shadow-orange-200'
                  : 'bg-stone-100 text-stone-600 border-transparent'
              }`}
            >
              <SelectValue placeholder="All Regions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Regions</SelectItem>
              {regions.map((r: any) => (
                <SelectItem key={r.id || r._id} value={String(r.id || r._id)}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isRegionFiltered && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSelectedRegion('all')}
              title="Remove region filter — wapas All Regions"
              aria-label="Remove region filter"
              className="h-8 w-8 rounded-full text-orange-700 hover:text-orange-800 hover:bg-orange-100 shrink-0"
            >
              <X size={14} />
            </Button>
          )}
        </div>
      </div>

      <h1 className="justify-self-center font-bold text-lg sm:text-xl text-orange-600 whitespace-nowrap px-2 select-none">
        <Link to="/" className="hover:opacity-80 transition-opacity">SolarCRM</Link>
      </h1>

      <div className="flex items-center justify-end gap-2 md:gap-4 min-w-0">
        <form onSubmit={submitNavSearch} className="relative hidden md:block min-w-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" size={14} />
          <input
            type="text"
            value={navSearch}
            onChange={(e) => setNavSearch(e.target.value)}
            placeholder="Search leads, clients..."
            className="h-8 w-full max-w-48 pl-9 pr-3 rounded-full bg-stone-100 border-transparent focus:bg-card focus:border-orange-300 focus:ring-4 focus:ring-orange-100 transition-all text-sm"
          />
        </form>

        <DropdownMenu>
          <DropdownMenuTrigger className="relative h-8 w-8 rounded-full hover:bg-stone-100 transition-colors flex items-center justify-center outline-none text-stone-600">
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-80" align="end">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>Notifications</span>
              {unreadCount > 0 && (
                <button onClick={handleMarkAllRead} className="text-[11px] font-medium text-orange-600 hover:underline">
                  Mark all read
                </button>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className="max-h-80 overflow-y-auto">
              {notifications.length > 0 ? (
                notifications.map((n) => (
                  <DropdownMenuItem 
                    key={n.id} 
                    className={`flex flex-col items-start p-3 gap-1 cursor-pointer ${!n.isRead ? 'bg-orange-50/50' : ''}`}
                    onClick={() => handleMarkAsRead(n.id)}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="font-semibold text-xs">{n.title}</span>
                      <span className="text-[10px] text-stone-400">{new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p className="text-xs text-stone-600 line-clamp-2">{n.message}</p>
                  </DropdownMenuItem>
                ))
              ) : (
                <div className="p-4 text-center text-stone-400 text-sm">No notifications</div>
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger className="relative h-8 w-8 rounded-full hover:bg-stone-100 transition-colors flex items-center justify-center outline-none">
            <Avatar className="h-8 w-8">
              <AvatarImage src={resolveImageUrl(user?.avatar)} alt={user?.name} />
              <AvatarFallback>{user?.name?.charAt(0) || 'U'}</AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{user?.name}</p>
                <p className="text-xs leading-none text-muted-foreground">
                  {user?.email}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => { setShowProfileCard(true); }}>Profile</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-red-600">
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {showProfileCard && user && (
        <ProfileCard
          employee={{
            name: user.name,
            email: user.email,
            phone: user.phone,
            role: user.role,
            profilePic: user.profilePic || user.avatar,
            joiningDate: (user as any).joiningDate,
            employeeId: user.id,
            isSuperAdmin: user.isSuperAdmin,
          }}
          onClose={() => setShowProfileCard(false)}
        />
      )}
    </header>
  );
};

export default Navbar;
