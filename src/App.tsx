import React, { Suspense, lazy, useCallback, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  ClipboardList,
  Cloud,
  Compass,
  ListChecks,
  Navigation,
  Settings,
} from 'lucide-react';
import { useItineraryStore } from './store/useItineraryStore';
import HomeView from './views/HomeView';
import { TripSummary } from './types';

const AdminView = lazy(() => import('./views/AdminView'));
const ChecklistView = lazy(() => import('./views/ChecklistView'));
const DetailView = lazy(() => import('./views/DetailView'));
const ExploreView = lazy(() => import('./views/ExploreView'));
const MapView = lazy(() => import('./components/Map/MapView'));

type TripTab = 'explore' | 'admin' | 'detail' | 'checklist';

const tabs: Array<{ id: TripTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'explore', label: '探索行程', icon: Compass },
  { id: 'detail', label: '行程单', icon: ClipboardList },
  { id: 'admin', label: '编辑行程', icon: Settings },
  { id: 'checklist', label: '\u786e\u8ba4\u6e05\u5355', icon: ListChecks },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TripTab>('explore');
  const [homeTrips, setHomeTrips] = useState<TripSummary[]>([]);
  const [selectedHomeSlug, setSelectedHomeSlug] = useState<string | null>(null);
  const { selectedTripSlug, trip, loading, saving, error, loadTrip, clearTrip } = useItineraryStore();

  const openTrip = async (slug: string) => {
    setActiveTab('explore');
    await loadTrip(slug);
  };

  const openCreatedTrip = async (slug: string) => {
    setActiveTab('admin');
    await loadTrip(slug);
  };

  const backHome = () => {
    clearTrip();
    setActiveTab('explore');
    setSelectedHomeSlug(null);
  };

  const handleTripsLoaded = useCallback((trips: TripSummary[]) => setHomeTrips(trips), []);
  const showingMap = !selectedTripSlug || activeTab === 'explore';
  const fixedAdminShell = Boolean(selectedTripSlug && activeTab === 'admin');
  const tripHeaderSpacing = 'px-4 sm:px-6 lg:px-8';
  const tripMainSpacing = activeTab === 'admin' ? 'px-4 pb-4 pt-3 sm:px-6 lg:px-8' : 'px-4 py-5 sm:px-6 lg:px-8';

  return (
    <div className={`relative min-h-[100dvh] overflow-hidden bg-slate-100 text-slate-800 antialiased print:bg-white ${showingMap || fixedAdminShell ? 'h-[100dvh]' : ''} ${fixedAdminShell ? 'flex flex-col' : ''}`}>
      {showingMap && (
        <div className="absolute inset-0">
          <Suspense fallback={<div className="h-full w-full animate-pulse bg-slate-200" aria-label="正在加载地图" />}>
            <MapView
              mode={selectedTripSlug ? 'trip' : 'home'}
              trips={homeTrips}
              selectedHomeSlug={selectedHomeSlug}
              onSelectHomeTrip={setSelectedHomeSlug}
              onOpenHomeTrip={openTrip}
            />
          </Suspense>
        </div>
      )}

      {!selectedTripSlug && (
        <HomeView
          onOpenTrip={openTrip}
          onCreateTrip={openCreatedTrip}
          selectedSlug={selectedHomeSlug}
          onSelectTrip={setSelectedHomeSlug}
          onTripsLoaded={handleTripsLoaded}
        />
      )}

      {selectedTripSlug && <header className={`z-[1100] mx-auto w-full shrink-0 pt-[max(1rem,env(safe-area-inset-top))] print:hidden ${tripHeaderSpacing} max-w-none ${activeTab === 'explore' ? 'absolute inset-x-0 top-0' : 'relative'}`}>
        <div className="flex flex-col items-center justify-between gap-3 rounded-2xl border border-white/60 bg-white/65 px-4 py-3 shadow-xl backdrop-blur-2xl md:flex-row">
          <div className="flex w-full min-w-0 items-center gap-3 md:w-auto">
            <button
              onClick={backHome}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200/70 bg-white/70 text-slate-600 transition hover:bg-white hover:text-indigo-600"
              title="返回旅行地图"
              aria-label="返回旅行地图"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-indigo-300 shadow-lg">
              <Navigation className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-black tracking-tight text-slate-900 sm:text-base">{trip?.title || '正在加载旅行计划'}</h1>
              <p className="mt-0.5 truncate text-[10px] font-medium text-slate-500 sm:text-xs">
                {trip ? `${trip.start_date} 至 ${trip.end_date} · ${trip.subtitle}` : '正在连接行程服务...'}
              </p>
            </div>
          </div>

          <nav className="flex w-full items-center gap-1 rounded-xl border border-slate-200/60 bg-slate-100/75 p-1 md:w-auto">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                aria-current={activeTab === id ? 'page' : undefined}
                className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition md:min-h-0 md:flex-none md:text-[11px] ${
                  activeTab === id ? 'bg-white text-indigo-950 shadow-sm' : 'text-slate-500 hover:bg-white/50 hover:text-slate-800'
                }`}
              >
                <Icon className={`h-3.5 w-3.5 ${activeTab === id ? 'text-indigo-500' : ''}`} />
                {label}
              </button>
            ))}
          </nav>

        </div>
      </header>}

      {selectedTripSlug && (loading || saving || error) && (
        <div className={`z-[1200] mx-auto mt-2 w-full max-w-7xl px-4 sm:px-6 lg:px-8 print:hidden ${activeTab === 'explore' ? 'absolute inset-x-0 top-20' : 'relative'}`} role="status" aria-live="polite">
          <div className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-semibold shadow-sm ${
            error ? 'border-red-100 bg-red-50 text-red-700' : 'border-white bg-white/75 text-slate-600'
          }`}>
            <Cloud className={`h-3.5 w-3.5 ${loading || saving ? 'animate-pulse' : ''}`} />
            {error || (loading ? '正在加载旅行计划...' : '正在同步修改...')}
          </div>
        </div>
      )}

      <Suspense fallback={<div className="relative z-10 grid min-h-48 place-items-center text-sm font-semibold text-slate-500" role="status">正在加载页面...</div>}>
      {selectedTripSlug && activeTab === 'explore' && <ExploreView />}

      {selectedTripSlug && activeTab !== 'explore' && <main className={`relative z-10 mx-auto w-full print:px-0 ${tripMainSpacing} ${activeTab === 'admin' ? 'min-h-0 flex-1 overflow-hidden max-w-none' : 'max-w-none'}`}>
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
            className={`w-full ${activeTab === 'admin' ? 'h-full min-h-0' : ''}`}
          >
            {activeTab === 'admin' && <AdminView />}
            {activeTab === 'detail' && <DetailView />}
            {activeTab === 'checklist' && <ChecklistView />}
          </motion.div>
        </AnimatePresence>
      </main>}
      </Suspense>
    </div>
  );
}
