'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Building2,
  Tags,
  Package,
  Wallet,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeftRight,
  BookOpenCheck,
  FileSpreadsheet,
  Printer,
  Settings,
  Users,
  Menu,
  X,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Lock,
} from 'lucide-react';
import { useApp } from '@/components/context/AppContext';
import { InstansiLogo } from '@/components/ui/InstansiLogo';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  activeClass: string;
  iconColorClass: string;
  roles?: Array<'Superadmin' | 'Pengurus Barang' | 'Admin Persediaan'>;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Utama',
    items: [
      {
        href: '/dashboard',
        label: 'Dashboard',
        icon: LayoutDashboard,
        activeClass: 'bg-teal-600 text-white',
        iconColorClass: 'text-teal-400',
      },
    ],
  },
  {
    title: 'Master Data',
    items: [
      {
        href: '/master/bagian',
        label: 'Master Bagian',
        icon: Building2,
        activeClass: 'bg-violet-600 text-white',
        iconColorClass: 'text-violet-400',
        roles: ['Superadmin', 'Pengurus Barang'],
      },
      {
        href: '/master/kategori',
        label: 'Kategori & Rekening',
        icon: Tags,
        activeClass: 'bg-violet-600 text-white',
        iconColorClass: 'text-violet-400',
        roles: ['Superadmin', 'Pengurus Barang'],
      },
      {
        href: '/master/barang',
        label: 'Katalog Barang',
        icon: Package,
        activeClass: 'bg-violet-600 text-white',
        iconColorClass: 'text-violet-400',
      },
    ],
  },
  {
    title: 'Anggaran & Rekon',
    items: [
      {
        href: '/anggaran',
        label: 'Plafon & Rekon',
        icon: Wallet,
        activeClass: 'bg-indigo-600 text-white',
        iconColorClass: 'text-indigo-400',
      },
    ],
  },
  {
    title: 'Transaksi Gudang',
    items: [
      {
        href: '/transaksi/masuk',
        label: 'Barang Masuk',
        icon: ArrowDownToLine,
        activeClass: 'bg-emerald-600 text-white',
        iconColorClass: 'text-emerald-400',
        roles: ['Superadmin', 'Admin Persediaan'],
      },
      {
        href: '/transaksi/keluar',
        label: 'Keluar & Opname',
        icon: ArrowUpFromLine,
        activeClass: 'bg-amber-600 text-white',
        iconColorClass: 'text-amber-400',
        roles: ['Superadmin', 'Admin Persediaan'],
      },
      {
        href: '/transaksi/mutasi',
        label: 'Mutasi Antar Bagian',
        icon: ArrowLeftRight,
        activeClass: 'bg-cyan-600 text-white',
        iconColorClass: 'text-cyan-400',
      },
    ],
  },
  {
    title: 'Pelaporan & Dokumen',
    items: [
      {
        href: '/laporan/kartu-persediaan',
        label: 'Kartu Persediaan',
        icon: BookOpenCheck,
        activeClass: 'bg-sky-600 text-white',
        iconColorClass: 'text-sky-400',
      },
      {
        href: '/laporan/rekap',
        label: 'Rekap Persediaan',
        icon: FileSpreadsheet,
        activeClass: 'bg-sky-600 text-white',
        iconColorClass: 'text-sky-400',
      },
      {
        href: '/laporan/berita-acara',
        label: 'Cetak Berita Acara',
        icon: Printer,
        activeClass: 'bg-sky-600 text-white',
        iconColorClass: 'text-sky-400',
      },
    ],
  },
  {
    title: 'Administrasi',
    items: [
      {
        href: '/pengaturan/instansi',
        label: 'Pengaturan Instansi',
        icon: Settings,
        activeClass: 'bg-slate-700 text-white',
        iconColorClass: 'text-slate-300',
        roles: ['Superadmin'],
      },
      {
        href: '/pengaturan/users',
        label: 'Manajemen User',
        icon: Users,
        activeClass: 'bg-slate-700 text-white',
        iconColorClass: 'text-slate-300',
        roles: ['Superadmin'],
      },
    ],
  },
];

interface AppShellProps {
  title: string;
  subtitle?: string;
  hideGlobalBagianFilter?: boolean;
  children: React.ReactNode;
}

export function AppShell({
  title,
  subtitle,
  hideGlobalBagianFilter = false,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    user,
    instansi,
    bagianList,
    availableYears,
    tahun,
    setTahun,
    selectedBagianId,
    setSelectedBagianId,
    isBagianLocked,
    loadingAuth,
    logout,
  } = useApp();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!loadingAuth && !user) {
      router.replace('/login');
    }
  }, [loadingAuth, user, router]);

  if (loadingAuth || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-teal-700 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-600 font-medium">Memuat sesi SIP-BHP...</p>
        </div>
      </div>
    );
  }

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  const renderNavLinks = (isMobile = false) => (
    <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
      {NAV_GROUPS.map((group) => {
        const visibleItems = group.items.filter(
          (item) => !item.roles || item.roles.includes(user.role)
        );
        if (visibleItems.length === 0) return null;

        return (
          <div key={group.title}>
            {(!collapsed || isMobile) && (
              <p className="px-3 mb-1.5 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                {group.title}
              </p>
            )}
            <div className="space-y-0.5">
              {visibleItems.map((item) => {
                const Icon = item.icon;
                const active =
                  pathname === item.href ||
                  (item.href !== '/dashboard' && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => isMobile && setMobileOpen(false)}
                    title={collapsed && !isMobile ? item.label : undefined}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                      active
                        ? item.activeClass
                        : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        active ? 'text-white' : item.iconColorClass
                      }`}
                    />
                    {(!collapsed || isMobile) && <span className="truncate">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Desktop Sidebar */}
      <aside
        className={`no-print hidden lg:flex flex-col bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 text-white border-r border-slate-800 shrink-0 transition-all duration-200 ${
          collapsed ? 'w-[72px]' : 'w-[260px]'
        }`}
      >
        <div className="h-16 px-4 flex items-center justify-between border-b border-slate-800">
          <Link href="/dashboard" className="flex items-center gap-3 min-w-0">
            <InstansiLogo
              logoUrl={instansi?.logoUrl}
              alt={instansi?.namaInstansi || 'Logo Setda Demak'}
              size={34}
            />
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-sm font-bold tracking-tight text-white truncate">
                  SIP-BHP SETDA
                </p>
                <p className="text-[11px] text-teal-400 font-medium truncate">Kabupaten Demak</p>
              </div>
            )}
          </Link>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 shrink-0"
            aria-label={collapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {renderNavLinks(false)}

        <div className="p-3 border-t border-slate-800">
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 text-white ${
                user.role === 'Superadmin'
                  ? 'bg-gradient-to-br from-teal-600 to-emerald-600'
                  : user.role === 'Pengurus Barang'
                  ? 'bg-gradient-to-br from-indigo-600 to-violet-600'
                  : 'bg-gradient-to-br from-amber-500 to-orange-600'
              }`}
            >
              {user.namaLengkap.slice(0, 2).toUpperCase()}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-white truncate">{user.namaLengkap}</p>
                <p
                  className={`text-[11px] truncate ${
                    user.role === 'Superadmin'
                      ? 'text-teal-300'
                      : user.role === 'Pengurus Barang'
                      ? 'text-indigo-300'
                      : 'text-amber-300'
                  }`}
                >
                  {user.role}
                  {user.bagianNama ? ` · ${user.bagianNama}` : ''}
                </p>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="no-print fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/60"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative w-72 max-w-[85vw] bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 text-white flex flex-col h-full z-10">
            <div className="h-16 px-4 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-3 min-w-0">
                <InstansiLogo logoUrl={instansi?.logoUrl} size={32} />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white truncate">SIP-BHP SETDA</p>
                  <p className="text-[11px] text-teal-400 font-medium truncate">Kabupaten Demak</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white"
                aria-label="Tutup menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {renderNavLinks(true)}
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="no-print h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 -ml-2 rounded-lg text-slate-600 hover:bg-slate-100"
              aria-label="Buka menu navigasi"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">{title}</h1>
              {subtitle && (
                <p className="text-xs text-slate-500 truncate hidden sm:block">{subtitle}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Global Year Selector */}
            <div className="flex items-center gap-1.5">
              <label htmlFor="global-year-select" className="text-xs font-medium text-slate-500 hidden md:inline">
                TA:
              </label>
              <select
                id="global-year-select"
                value={tahun}
                onChange={(e) => setTahun(Number(e.target.value))}
                className="h-9 px-2.5 text-xs sm:text-sm font-semibold font-mono tabular-nums bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-600"
              >
                {availableYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            {/* Global Bagian Filter */}
            {!hideGlobalBagianFilter && (
              <div className="hidden sm:flex items-center gap-1.5">
                {isBagianLocked ? (
                  <div
                    className="h-9 px-3 flex items-center gap-1.5 text-xs font-medium bg-slate-100 border border-slate-200 rounded-lg text-slate-700 whitespace-nowrap"
                    title="Terkunci ke Bagian akun Anda"
                  >
                    <Lock className="w-3.5 h-3.5 text-slate-500" />
                    <span>{user.bagianNama || 'Bagian Terkait'}</span>
                  </div>
                ) : (
                  <select
                    aria-label="Filter Bagian"
                    value={selectedBagianId}
                    onChange={(e) => setSelectedBagianId(e.target.value)}
                    className="h-9 px-2.5 text-xs sm:text-sm font-medium bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-600 max-w-[180px]"
                  >
                    <option value="ALL">Semua Bagian (Setda)</option>
                    {bagianList.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.kode} · {b.nama}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={handleLogout}
              className="h-9 px-3 flex items-center gap-1.5 text-xs sm:text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
              title="Keluar dari aplikasi"
            >
              <LogOut className="w-4 h-4 text-slate-500" />
              <span className="hidden sm:inline">Keluar</span>
            </button>
          </div>
        </header>

        {/* Page Viewport */}
        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
