import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  BedDouble,
  CalendarDays,
  Compass,
  MapPin,
  Plus,
  Route,
  Search,
  Users,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { TripRegion, TripSummary } from '../types';
import { mapProviderForRegion, tripRegionLabel } from '../map/provider';

interface HomeViewProps {
  onOpenTrip: (slug: string) => void;
  onCreateTrip: (slug: string) => void;
  selectedSlug: string | null;
  onSelectTrip: (slug: string | null) => void;
  onTripsLoaded: (trips: TripSummary[]) => void;
}

const HOME_TRIPS_CACHE_KEY = 'voyageplanner.homeTrips.v2';

const formatDate = (date: string) =>
  new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(new Date(`${date}T00:00:00`));

const formatDateRange = (trip: TripSummary) => `${formatDate(trip.start_date)} - ${formatDate(trip.end_date)}`;

const resolvedTripCenter = (trip: TripSummary) => {
  const label = `${trip.slug} ${trip.title}`.toLowerCase();
  if (label.includes('iceland') || trip.title.includes('冰岛')) return { center_lat: 65, center_lng: -18 };
  if (label.includes('dalian') || trip.title.includes('大连')) return { center_lat: 38.9, center_lng: 121.6 };
  return { center_lat: trip.center_lat, center_lng: trip.center_lng };
};

const normaliseTripSummary = (trip: TripSummary): TripSummary => ({
  ...trip,
  ...resolvedTripCenter(trip),
});

const readCachedTrips = () => {
  if (typeof window === 'undefined') return [] as TripSummary[];
  try {
    const raw = window.localStorage.getItem(HOME_TRIPS_CACHE_KEY);
    if (!raw) return [] as TripSummary[];
    const parsed = JSON.parse(raw) as TripSummary[];
    return Array.isArray(parsed) ? parsed.map(normaliseTripSummary) : [];
  } catch {
    return [] as TripSummary[];
  }
};

const cacheTrips = (trips: TripSummary[]) => {
  try {
    window.localStorage.setItem(HOME_TRIPS_CACHE_KEY, JSON.stringify(trips));
  } catch {
    // Ignore storage quota or private-mode failures; live fetch still works.
  }
};

const tripRouteText = (trip: TripSummary) => {
  const cities = trip.cities.filter(Boolean);
  if (cities.length) return cities.slice(0, 3).join(' · ');
  return trip.origin || trip.subtitle || '目的地待补充';
};

export default function HomeView({ onOpenTrip, onCreateTrip, selectedSlug, onSelectTrip, onTripsLoaded }: HomeViewProps) {
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ title: string; start_date: string; end_date: string; origin: string; travelers: number; trip_region: TripRegion }>({
    title: '',
    start_date: '',
    end_date: '',
    origin: '',
    travelers: 1,
    trip_region: 'overseas',
  });

  const focusTrip = (slug: string) => onSelectTrip(slug);

  const openTrip = (slug: string) => {
    onSelectTrip(slug);
    onOpenTrip(slug);
  };

  const createTrip = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreateError(null);
    const response = await fetch('/api/trips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
    const data = await response.json();
    if (!response.ok) {
      setCreateError(data.error || '创建旅行失败');
      return;
    }
    onCreateTrip(data.slug);
  };

  useEffect(() => {
    let cancelled = false;
    const cachedTrips = readCachedTrips();
    if (cachedTrips.length) {
      setTrips(cachedTrips);
      onTripsLoaded(cachedTrips);
      setLoading(false);
    }

    fetch('/api/trips', { headers: { Accept: 'application/json' } })
      .then(async (response) => {
        if (!response.ok) throw new Error('行程列表加载失败');
        return response.json();
      })
      .then((data: TripSummary[]) => {
        if (cancelled) return;
        const nextTrips = data.map(normaliseTripSummary);
        setTrips(nextTrips);
        onTripsLoaded(nextTrips);
        cacheTrips(nextTrips);
        setError(null);
      })
      .catch((reason) => {
        if (!cancelled && !cachedTrips.length) {
          setError(reason instanceof Error ? reason.message : '行程列表加载失败');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [onTripsLoaded]);

  const filteredTrips = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return trips;
    return trips.filter((trip) =>
      [trip.title, trip.subtitle, trip.summary, trip.origin, ...trip.cities].join(' ').toLowerCase().includes(keyword),
    );
  }, [query, trips]);

  const selectedTrip = trips.find((trip) => trip.slug === selectedSlug) ?? null;
  const totalDays = trips.reduce((sum, trip) => sum + trip.day_count, 0);

  return (
    <div className="pointer-events-none relative z-[800] h-screen min-h-[680px] w-full overflow-hidden text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,transparent_20%,rgba(2,6,23,0.22)_65%,rgba(2,6,23,0.72)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-slate-950/75 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-slate-950/80 to-transparent" />

      <header className="pointer-events-auto absolute inset-x-0 top-0 z-[1000] flex justify-end p-4 sm:p-6 lg:p-8">
        <div className="flex items-center gap-2">
          <button onClick={() => setCreating(true)} className="flex items-center gap-1.5 rounded-xl bg-indigo-500 px-3.5 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400">
            <Plus className="h-4 w-4" /> 新建旅行
          </button>
          <div className="hidden items-center gap-3 rounded-2xl border border-white/15 bg-slate-950/55 px-4 py-3 text-xs shadow-2xl backdrop-blur-xl sm:flex">
            <div><span className="font-black text-white">{trips.length}</span><span className="ml-1.5 text-slate-400">段旅程</span></div>
            <div className="h-4 w-px bg-white/15" />
            <div><span className="font-black text-white">{totalDays}</span><span className="ml-1.5 text-slate-400">天在路上</span></div>
          </div>
        </div>
      </header>

      {creating && (
        <div className="pointer-events-auto absolute inset-0 z-[3000] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <form onSubmit={createTrip} className="w-full max-w-md rounded-[28px] border border-white/15 bg-slate-950/95 p-5 shadow-2xl">
            <div className="flex items-start justify-between">
              <div><div className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-300">New journey</div><h2 className="mt-1 text-xl font-black">创建新的旅行计划</h2></div>
              <button type="button" onClick={() => setCreating(false)} className="rounded-full bg-white/10 p-2 text-slate-300"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-5 space-y-3 text-xs">
              <label className="block font-bold text-slate-300">旅行名称<input required value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="例如：日本关西赏樱" className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2.5 text-white outline-none focus:border-indigo-400" /></label>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-1">
                <div className="grid grid-cols-2 gap-1">
                  {(['overseas', 'domestic'] as TripRegion[]).map((region) => {
                    const active = draft.trip_region === region;
                    const provider = mapProviderForRegion(region);
                    return (
                      <button
                        key={region}
                        type="button"
                        onClick={() => setDraft({ ...draft, trip_region: region })}
                        className={`rounded-xl px-3 py-2 text-left transition ${active ? 'bg-white text-slate-950 shadow-lg' : 'text-slate-400 hover:bg-white/10 hover:text-white'}`}
                      >
                        <span className="block text-xs font-black">{tripRegionLabel[region]}</span>
                        <span className="mt-0.5 block text-[10px] font-semibold opacity-70">{provider === 'google' ? 'Google Maps' : '高德地图'}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="font-bold text-slate-300">开始日期<input required type="date" value={draft.start_date} onChange={(e) => setDraft({ ...draft, start_date: e.target.value })} className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2.5 text-white outline-none" /></label>
                <label className="font-bold text-slate-300">结束日期<input required type="date" value={draft.end_date} onChange={(e) => setDraft({ ...draft, end_date: e.target.value })} className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2.5 text-white outline-none" /></label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="font-bold text-slate-300">出发地<input value={draft.origin} onChange={(e) => setDraft({ ...draft, origin: e.target.value })} className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2.5 text-white outline-none" /></label>
                <label className="font-bold text-slate-300">旅行人数<input min="1" type="number" value={draft.travelers} onChange={(e) => setDraft({ ...draft, travelers: Number(e.target.value) })} className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2.5 text-white outline-none" /></label>
              </div>
            </div>
            {createError && <p className="mt-3 text-xs font-semibold text-rose-300">{createError}</p>}
            <button className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 py-3 text-xs font-black text-white hover:bg-indigo-400"><Plus className="h-4 w-4" /> 创建并开始规划</button>
          </form>
        </div>
      )}

      <aside className="pointer-events-auto absolute right-4 top-24 z-[1000] hidden w-[360px] sm:block lg:right-8 lg:top-28">
        <div className="overflow-hidden rounded-[28px] border border-white/15 bg-slate-950/65 shadow-2xl backdrop-blur-2xl">
          <div className="border-b border-white/10 p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索地点或旅程"
                className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-10 pr-3 text-xs text-white outline-none placeholder:text-slate-500 focus:border-indigo-400/60"
              />
            </div>
          </div>

          <div className="max-h-[calc(100vh-210px)] space-y-2 overflow-y-auto p-3 no-scrollbar">
            {loading && !trips.length && <div className="p-6 text-center text-xs text-slate-400">正在展开旅行地图...</div>}
            {loading && trips.length > 0 && <div className="px-2 pb-1 text-[10px] font-semibold text-slate-500">正在同步最新行程...</div>}
            {error && <div className="p-6 text-center text-xs text-rose-300">{error}</div>}
            {filteredTrips.map((trip) => {
              const selected = selectedSlug === trip.slug;
              return (
                <button
                  key={trip.slug}
                  onClick={() => focusTrip(trip.slug)}
                  className={`group w-full overflow-hidden rounded-2xl border text-left transition ${
                    selected ? 'border-indigo-400/70 bg-white/12 shadow-lg shadow-indigo-950/20' : 'border-white/5 bg-white/[0.035] hover:bg-white/[0.07]'
                  }`}
                >
                  <div className="flex gap-3 p-2.5">
                    <img src={trip.cover_image_url} alt="" className="h-20 w-24 shrink-0 rounded-xl object-cover" />
                    <div className="min-w-0 flex-1 py-1">
                      <div className="text-[10px] font-bold text-indigo-300">{formatDateRange(trip)}</div>
                      <h2 className="mt-1 truncate text-sm font-bold text-white">{trip.title}</h2>
                      <div className="mt-2 flex items-center gap-2 text-[10px] font-semibold text-slate-400">
                        <span>{trip.day_count} 天</span><span>·</span><span>{trip.node_count} 个地点</span>
                      </div>
                    </div>
                    <MapPin className={`mt-2 h-4 w-4 transition ${selected ? 'text-indigo-300' : 'text-slate-500 group-hover:text-white'}`} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      <AnimatePresence>
        {selectedTrip && (
          <motion.div
            key={selectedTrip.slug}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="pointer-events-auto absolute bottom-5 right-4 z-[1001] w-[calc(100%-2rem)] overflow-hidden rounded-[24px] border border-white/15 bg-slate-950/84 shadow-2xl backdrop-blur-2xl sm:hidden"
          >
            <div className="flex gap-3 p-3">
              <img src={selectedTrip.cover_image_url} alt="" className="h-28 w-28 shrink-0 rounded-2xl object-cover" />
              <div className="min-w-0 flex-1 py-1">
                <div className="text-[10px] font-bold text-indigo-300">{formatDateRange(selectedTrip)}</div>
                <h2 className="mt-1 line-clamp-2 text-sm font-black">{selectedTrip.title}</h2>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[9px] font-bold text-slate-300">
                  <span className="rounded-full bg-white/10 px-2 py-1">{selectedTrip.day_count} 天</span>
                  <span className="rounded-full bg-white/10 px-2 py-1">{selectedTrip.node_count} 个地点</span>
                </div>
                <button onClick={() => openTrip(selectedTrip.slug)} className="mt-3 flex items-center gap-1.5 rounded-xl bg-indigo-500 px-3 py-2 text-[11px] font-bold text-white">
                  打开旅行计划 <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {selectedTrip && (
        <div className="pointer-events-auto absolute bottom-8 right-[400px] z-[1000] hidden w-[360px] overflow-hidden rounded-[28px] border border-white/15 bg-slate-950/78 shadow-2xl backdrop-blur-2xl lg:block">
          <div className="relative h-40 overflow-hidden">
            <img src={selectedTrip.cover_image_url} alt={selectedTrip.title} className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/18 to-transparent" />
            <div className="absolute left-4 top-4 rounded-full border border-white/20 bg-slate-950/58 px-3 py-1 text-[10px] font-black text-white backdrop-blur-md">{formatDateRange(selectedTrip)}</div>
            <div className="absolute bottom-4 left-4 right-4">
              <div className="flex items-center gap-2 text-[10px] font-bold text-indigo-200">
                <MapPin className="h-3.5 w-3.5" /> {tripRouteText(selectedTrip)}
              </div>
              <h2 className="mt-1 line-clamp-2 text-xl font-black leading-tight">{selectedTrip.title}</h2>
            </div>
          </div>
          <div className="p-4">
            <p className="line-clamp-2 text-[11px] leading-relaxed text-slate-300">{selectedTrip.summary}</p>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[10px] font-semibold text-slate-300">
              <div className="rounded-xl border border-white/10 bg-white/6 px-2 py-2"><CalendarDays className="mx-auto mb-1 h-3.5 w-3.5 text-indigo-300" />{selectedTrip.day_count} 天</div>
              <div className="rounded-xl border border-white/10 bg-white/6 px-2 py-2"><Compass className="mx-auto mb-1 h-3.5 w-3.5 text-sky-300" />{selectedTrip.node_count} 地点</div>
              <div className="rounded-xl border border-white/10 bg-white/6 px-2 py-2"><Users className="mx-auto mb-1 h-3.5 w-3.5 text-emerald-300" />{selectedTrip.travelers} 人</div>
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-[10px] font-semibold text-slate-300">
              <Route className="h-3.5 w-3.5 text-indigo-300" />
              <span className="min-w-0 flex-1 truncate">{selectedTrip.subtitle}</span>
              <BedDouble className="h-3.5 w-3.5 text-emerald-300" />
            </div>
            <button onClick={() => openTrip(selectedTrip.slug)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 py-3 text-xs font-bold text-white shadow-lg shadow-indigo-950/25 transition hover:bg-indigo-400">
              打开旅行计划 <ArrowUpRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}