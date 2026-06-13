import React, { useCallback, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  ClipboardList,
  Cloud,
  Compass,
  Navigation,
  Settings,
} from 'lucide-react';
import { useItineraryStore } from './store/useItineraryStore';
import AdminView from './views/AdminView';
import DetailView from './views/DetailView';
import ExploreView from './views/ExploreView';
import HomeView from './views/HomeView';
import MapView from './components/Map/MapView';
import { TripSummary } from './types';

type TripTab = 'explore' | 'admin' | 'detail';

const tabs: Array<{ id: TripTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'explore', label: '探索行程', icon: Compass },
  { id: 'detail', label: '计划表', icon: ClipboardList },
  { id: 'admin', label: '维护', icon: Settings },
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

  return (
    <div className={`relative min-h-screen overflow-hidden bg-slate-100 text-slate-800 antialiased print:bg-white ${showingMap ? 'h-screen' : ''}`}>
      {showingMap && (
        <div className="absolute inset-0">
          <MapView
            mode={selectedTripSlug ? 'trip' : 'home'}
            trips={homeTrips}
            selectedHomeSlug={selectedHomeSlug}
            onSelectHomeTrip={setSelectedHomeSlug}
            onOpenHomeTrip={openTrip}
          />
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

      {selectedTripSlug && <header className={`z-[1100] mx-auto w-full px-4 pt-4 sm:px-6 lg:px-8 print:hidden ${activeTab === 'explore' ? 'absolute inset-x-0 top-0 max-w-none' : 'relative max-w-7xl'}`}>
        <div className="flex flex-col items-center justify-between gap-3 rounded-2xl border border-white/60 bg-white/65 px-4 py-3 shadow-xl backdrop-blur-2xl md:flex-row">
          <div className="flex w-full min-w-0 items-center gap-3 md:w-auto">
            <button
              onClick={backHome}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200/70 bg-white/70 text-slate-600 transition hover:bg-white hover:text-indigo-600"
              title="返回旅行地图"
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
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-bold transition md:flex-none ${
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
        <div className={`z-[1200] mx-auto mt-2 w-full max-w-7xl px-4 sm:px-6 lg:px-8 print:hidden ${activeTab === 'explore' ? 'absolute inset-x-0 top-20' : 'relative'}`}>
          <div className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-semibold shadow-sm ${
            error ? 'border-red-100 bg-red-50 text-red-700' : 'border-white bg-white/75 text-slate-600'
          }`}>
            <Cloud className={`h-3.5 w-3.5 ${loading || saving ? 'animate-pulse' : ''}`} />
            {error || (loading ? '正在加载旅行计划...' : '正在同步修改...')}
          </div>
        </div>
      )}

      {selectedTripSlug && <main className={`relative z-10 mx-auto w-full print:px-0 ${
        activeTab === 'explore' ? 'h-screen max-w-none' : 'max-w-7xl px-4 py-5 sm:px-6 lg:px-8'
      }`}>
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
            className={`w-full ${activeTab === 'explore' ? 'h-full' : ''}`}
          >
            {activeTab === 'explore' && <ExploreView />}
            {activeTab === 'admin' && <AdminView />}
            {activeTab === 'detail' && <DetailView />}
          </motion.div>
        </AnimatePresence>
      </main>}
    </div>
  );
}
