import React, { useEffect, useMemo, useState } from 'react';
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from 'react-leaflet';
import {
  ArrowUpRight,
  CalendarDays,
  Compass,
  MapPin,
  Navigation,
  Plus,
  Search,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { TripSummary } from '../types';

interface HomeViewProps {
  onOpenTrip: (slug: string) => void;
  onCreateTrip: (slug: string) => void;
}

function MapFocus({ trip }: { trip: TripSummary | null }) {
  const map = useMap();

  useEffect(() => {
    if (trip) {
      map.flyTo([trip.center_lat, trip.center_lng], 5, { duration: 1.4 });
    } else {
      map.flyTo([32, 12], 2, { duration: 1.2 });
    }
  }, [map, trip]);

  return null;
}

const formatDate = (date: string) =>
  new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(new Date(`${date}T00:00:00`));

export default function HomeView({ onOpenTrip, onCreateTrip }: HomeViewProps) {
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ title: '', start_date: '', end_date: '', origin: '', travelers: 1 });

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
    fetch('/api/trips')
      .then(async (response) => {
        if (!response.ok) throw new Error('行程列表加载失败');
        return response.json();
      })
      .then((data: TripSummary[]) => {
        setTrips(data);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : '行程列表加载失败'))
      .finally(() => setLoading(false));
  }, []);

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
    <div className="relative h-screen min-h-[680px] w-full overflow-hidden bg-slate-950 text-white">
      <MapContainer center={[32, 12]} zoom={2} minZoom={2} zoomControl={false} className="absolute inset-0 h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <MapFocus trip={selectedTrip} />
        {trips.map((trip) => {
          const active = trip.slug === selectedSlug;
          return (
            <CircleMarker
              key={trip.slug}
              center={[trip.center_lat, trip.center_lng]}
              radius={active ? 13 : 9}
              pathOptions={{
                color: '#ffffff',
                weight: active ? 3 : 2,
                fillColor: active ? '#818cf8' : '#38bdf8',
                fillOpacity: 1,
              }}
              eventHandlers={{ click: () => setSelectedSlug(trip.slug) }}
            >
              <Tooltip direction="top" offset={[0, -12]} opacity={1}>
                <span className="font-semibold">{trip.title}</span>
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,transparent_20%,rgba(2,6,23,0.22)_65%,rgba(2,6,23,0.72)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-slate-950/75 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-slate-950/80 to-transparent" />

      <header className="absolute inset-x-0 top-0 z-[1000] flex items-start justify-between gap-4 p-4 sm:p-6 lg:p-8">
        <div className="flex items-center gap-3 rounded-2xl border border-white/15 bg-slate-950/55 px-3.5 py-3 shadow-2xl backdrop-blur-xl">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500 text-white shadow-lg shadow-indigo-500/25">
            <Navigation className="h-5 w-5" />
          </div>
          <div>
            <div className="font-black tracking-tight">旅途收藏夹</div>
            <div className="text-[10px] font-semibold tracking-[0.18em] text-slate-400">MY JOURNEY ATLAS</div>
          </div>
        </div>

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
        <div className="absolute inset-0 z-[3000] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <form onSubmit={createTrip} className="w-full max-w-md rounded-[28px] border border-white/15 bg-slate-950/95 p-5 shadow-2xl">
            <div className="flex items-start justify-between">
              <div><div className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-300">New journey</div><h2 className="mt-1 text-xl font-black">创建新的旅行计划</h2></div>
              <button type="button" onClick={() => setCreating(false)} className="rounded-full bg-white/10 p-2 text-slate-300"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-5 space-y-3 text-xs">
              <label className="block font-bold text-slate-300">旅行名称<input required value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="例如：日本关西赏樱" className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2.5 text-white outline-none focus:border-indigo-400" /></label>
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

      <section className={`absolute bottom-5 left-4 z-[1000] max-w-xl sm:bottom-8 sm:left-6 lg:bottom-10 lg:left-8 ${selectedTrip ? 'hidden sm:block' : ''}`}>
        <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-indigo-300">
          <Sparkles className="h-3.5 w-3.5" /> Travel stories, pinned
        </div>
        <h1 className="max-w-lg text-3xl font-black leading-[1.08] tracking-tight sm:text-5xl">
          把走过与将去的地方，
          <span className="text-indigo-300">留在一张地图上。</span>
        </h1>
        <p className="mt-3 max-w-md text-xs leading-relaxed text-slate-300 sm:text-sm">
          点击地图上的旅行坐标，打开对应的路线、住宿、景点与每日计划。
        </p>
      </section>

      <aside className="absolute right-4 top-24 z-[1000] hidden w-[360px] sm:block lg:right-8 lg:top-28">
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
            {loading && <div className="p-6 text-center text-xs text-slate-400">正在展开旅行地图...</div>}
            {error && <div className="p-6 text-center text-xs text-rose-300">{error}</div>}
            {filteredTrips.map((trip) => (
              <button
                key={trip.slug}
                onMouseEnter={() => setSelectedSlug(trip.slug)}
                onFocus={() => setSelectedSlug(trip.slug)}
                onClick={() => onOpenTrip(trip.slug)}
                className={`group w-full overflow-hidden rounded-2xl border text-left transition ${
                  selectedSlug === trip.slug ? 'border-indigo-400/60 bg-white/10' : 'border-white/5 bg-white/[0.035] hover:bg-white/[0.07]'
                }`}
              >
                <div className="flex gap-3 p-2.5">
                  <img src={trip.cover_image_url} alt="" className="h-20 w-24 shrink-0 rounded-xl object-cover" />
                  <div className="min-w-0 flex-1 py-1">
                    <div className="text-[10px] font-bold text-indigo-300">{formatDate(trip.start_date)} - {formatDate(trip.end_date)}</div>
                    <h2 className="mt-1 truncate text-sm font-bold text-white">{trip.title}</h2>
                    <div className="mt-2 flex items-center gap-2 text-[10px] font-semibold text-slate-400">
                      <span>{trip.day_count} 天</span><span>·</span><span>{trip.node_count} 个地点</span>
                    </div>
                  </div>
                  <ArrowUpRight className="mt-2 h-4 w-4 text-slate-500 transition group-hover:text-white" />
                </div>
              </button>
            ))}
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
            className="absolute bottom-5 right-4 z-[1001] w-[calc(100%-2rem)] overflow-hidden rounded-[24px] border border-white/15 bg-slate-950/80 shadow-2xl backdrop-blur-2xl sm:hidden"
          >
            <div className="flex gap-3 p-3">
              <img src={selectedTrip.cover_image_url} alt="" className="h-24 w-28 shrink-0 rounded-2xl object-cover" />
              <div className="min-w-0 flex-1 py-1">
                <div className="text-[10px] font-bold text-indigo-300">{formatDate(selectedTrip.start_date)} - {formatDate(selectedTrip.end_date)}</div>
                <h2 className="mt-1 truncate text-sm font-bold">{selectedTrip.title}</h2>
                <button onClick={() => onOpenTrip(selectedTrip.slug)} className="mt-3 flex items-center gap-1.5 rounded-xl bg-indigo-500 px-3 py-2 text-[11px] font-bold text-white">
                  打开旅行计划 <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {selectedTrip && (
        <div className="absolute bottom-10 right-[400px] z-[1000] hidden w-[330px] overflow-hidden rounded-[26px] border border-white/15 bg-slate-950/72 shadow-2xl backdrop-blur-2xl lg:block">
          <img src={selectedTrip.cover_image_url} alt={selectedTrip.title} className="h-36 w-full object-cover" />
          <div className="p-4">
            <div className="flex items-center gap-2 text-[10px] font-bold text-indigo-300">
              <MapPin className="h-3.5 w-3.5" /> {selectedTrip.cities.slice(0, 3).join(' · ')}
            </div>
            <h2 className="mt-2 text-lg font-black">{selectedTrip.title}</h2>
            <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-400">{selectedTrip.summary}</p>
            <div className="mt-3 flex items-center gap-3 text-[10px] font-semibold text-slate-300">
              <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{selectedTrip.day_count} 天</span>
              <span className="flex items-center gap-1"><Compass className="h-3.5 w-3.5" />{selectedTrip.node_count} 个地点</span>
              <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{selectedTrip.travelers} 人</span>
            </div>
            <button onClick={() => onOpenTrip(selectedTrip.slug)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 py-3 text-xs font-bold text-white transition hover:bg-indigo-400">
              打开旅行计划 <ArrowUpRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
