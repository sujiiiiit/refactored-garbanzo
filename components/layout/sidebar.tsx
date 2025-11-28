'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Users,
  Receipt,
  PieChart,
  Settings,
  Building2,
  Menu,
  X,
  LogOut,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useState } from 'react';
import { useUser } from '@/hooks/use-user';
import { signOut } from '@/lib/actions/auth';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Groups', href: '/groups', icon: Users },
  { name: 'Reports', href: '/reports', icon: PieChart },
  { name: 'Settings', href: '/settings', icon: Settings },
];

const businessNavigation = [
  { name: 'Business', href: '/business', icon: Building2 },
];

export function Sidebar() {
  const pathname = usePathname();
  const { profile } = useUser();
  const [open, setOpen] = useState(false);

  const NavLinks = () => (
    <>
      <div className="space-y-1">
        {navigation.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={() => setOpen(false)}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          );
        })}
      </div>

      {profile?.is_business_user && (
        <div className="mt-6">
          <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Business
          </h3>
          <div className="space-y-1">
            {businessNavigation.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.name}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-64 lg:flex-col">
        <div className="flex grow flex-col gap-y-5 overflow-y-auto border-r bg-background px-4 py-6">
          {/* Logo */}
          <Link href="/dashboard" className="flex items-center gap-2 px-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Receipt className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold">SmartSplit</span>
          </Link>

          {/* Quick Actions */}
          <div className="px-2">
            <Link href="/groups/new">
              <Button className="w-full" size="sm">
                <Plus className="mr-2 h-4 w-4" />
                New Group
              </Button>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-2">
            <NavLinks />
          </nav>

          {/* User Menu */}
          <div className="px-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="w-full justify-start gap-3 px-2">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={profile?.avatar_url || ''} />
                    <AvatarFallback>
                      {profile?.full_name?.charAt(0) || profile?.email?.charAt(0) || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col items-start text-sm">
                    <span className="font-medium">{profile?.full_name || 'User'}</span>
                    <span className="text-xs text-muted-foreground truncate max-w-[140px]">
                      {profile?.email}
                    </span>
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/settings">
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut()} className="text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </aside>

      {/* Mobile Header */}
      <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b bg-background px-4 lg:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden">
              <Menu className="h-6 w-6" />
              <span className="sr-only">Toggle menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0">
            <div className="flex h-full flex-col gap-y-5 overflow-y-auto px-4 py-6">
              {/* Logo */}
              <div className="flex items-center justify-between">
                <Link href="/dashboard" className="flex items-center gap-2" onClick={() => setOpen(false)}>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                    <Receipt className="h-5 w-5 text-primary-foreground" />
                  </div>
                  <span className="text-xl font-bold">SmartSplit</span>
                </Link>
              </div>

              {/* Quick Actions */}
              <div>
                <Link href="/groups/new" onClick={() => setOpen(false)}>
                  <Button className="w-full" size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    New Group
                  </Button>
                </Link>
              </div>

              {/* Navigation */}
              <nav className="flex-1">
                <NavLinks />
              </nav>

              {/* User Info */}
              <div className="border-t pt-4">
                <div className="flex items-center gap-3 px-2">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={profile?.avatar_url || ''} />
                    <AvatarFallback>
                      {profile?.full_name?.charAt(0) || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col text-sm">
                    <span className="font-medium">{profile?.full_name || 'User'}</span>
                    <span className="text-xs text-muted-foreground">
                      {profile?.email}
                    </span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  className="mt-2 w-full justify-start text-destructive"
                  onClick={() => signOut()}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Receipt className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-bold">SmartSplit</span>
        </Link>
      </header>
    </>
  );
}
