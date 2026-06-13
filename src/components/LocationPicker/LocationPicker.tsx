import React, { useEffect, useState } from 'react';
import { CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { Check, Globe2, LoaderCircle, MapIcon, MapPin, Search } from 'lucide-react';

type LocationProvider = 'amap' | 'osm';

export interface LocationValue {
  lat: number;
  lng: number;
  city?: string;
  address?: string;
  title?: string;
}

interface SearchResult {
  name: string;
  display_name: string;
  lat: number;
  lng: number;
  city: string;
  provider: LocationProvider;
}

interface LocationPickerProps {
  value: LocationValue;
  onChange: (value: LocationValue) => void;
}

const searchCache = new Map<string, SearchResult[]>();

function isInChina(lat: number, lng: number) {
  return lng >= 72.004 && lng <= 137.8347 && lat >= 0.8293 && lat <= 55.8271;
}

function MapController({ value }: { value: LocationValue }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([value.lat, value.lng], 13, { duration: 0.8 });
  }, [map, value.lat, value.lng]);
  return null;
}

function ClickPicker({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (event) => onPick(event.latlng.lat, event.latlng.lng) });
  return null;
}

export default function LocationPicker({ value, onChange }: LocationPickerProps) {
  const [provider, setProvider] = useState<LocationProvider>(() => (isInChina(value.lat, value.lng) ? 'amap' : 'osm'));
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [cacheHit, setCacheHit] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const switchProvider = (nextProvider: LocationProvider) => {
    setProvider(nextProvider);
    setResults([]);
    setError(null);
    setCacheHit(false);
  };

  const search = async () => {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 2) {
      setError('请至少输入 2 个字符');
      return;
    }

    const cacheKey = `${provider}:${normalizedQuery.toLocaleLowerCase()}`;
    const cached = searchCache.get(cacheKey);
    if (cached) {
      setResults(cached);
      setCacheHit(true);
      setError(cached.length ? null : '没有找到匹配地点，可以直接点击地图选位置');
      return;
    }

    setSearching(true);
    setCacheHit(false);
    setError(null);
    try {
      const response = await fetch(`/api/geocode/search?q=${encodeURIComponent(normalizedQuery)}&provider=${provider}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '地点搜索失败');
      searchCache.set(cacheKey, data);
      setResults(data);
      if (!data.length) setError('没有找到匹配地点，可以直接点击地图选位置');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '地点搜索失败');
    } finally {
      setSearching(false);
    }
  };

  const choose = (result: SearchResult) => {
    onChange({
      lat: result.lat,
      lng: result.lng,
      city: result.city,
      address: result.display_name,
      title: result.name,
    });
    setQuery(result.name);
    setResults([]);
  };

  const pickOnMap = async (lat: number, lng: number) => {
    onChange({ ...value, lat, lng });
    setResolving(true);
    setError(null);
    try {
      const response = await fetch(`/api/geocode/reverse?lat=${lat}&lng=${lng}&provider=${provider}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '地址解析失败');
      onChange({ ...value, lat, lng, city: data.city || value.city, address: data.display_name || value.address });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '已选择位置，但地址解析失败');
    } finally {
      setResolving(false);
    }
  };

  const providerLabel = provider === 'amap' ? '高德地图' : 'OpenStreetMap';

  return (
    <div className="space-y-3 rounded-2xl border border-indigo-100 bg-indigo-50/45 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
          <MapPin className="h-3.5 w-3.5 text-indigo-600" />
          选择地点
        </span>
        <div className="flex rounded-lg border border-indigo-100 bg-white/80 p-0.5 text-[10px] font-bold">
          <button
            type="button"
            onClick={() => switchProvider('amap')}
            className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 transition ${provider === 'amap' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-indigo-700'}`}
          >
            <MapIcon className="h-3 w-3" /> 国内
          </button>
          <button
            type="button"
            onClick={() => switchProvider('osm')}
            className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 transition ${provider === 'osm' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-indigo-700'}`}
          >
            <Globe2 className="h-3 w-3" /> 海外
          </button>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void search();
              }
            }}
            placeholder={provider === 'amap' ? '搜索国内景点、酒店或地址' : '搜索海外地点或英文地址'}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 pl-9 text-xs outline-none focus:border-indigo-400"
          />
        </div>
        <button
          type="button"
          onClick={() => void search()}
          disabled={searching || query.trim().length < 2}
          className="flex items-center gap-1 rounded-xl bg-indigo-600 px-3 text-[11px] font-bold text-white disabled:opacity-40"
        >
          {searching ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          搜索
        </button>
      </div>

      <div className="flex items-center justify-between px-0.5 text-[9px] text-slate-400">
        <span>当前使用 {providerLabel}，仅点击搜索时调用接口</span>
        {cacheHit && <span className="font-bold text-emerald-600">已使用缓存</span>}
      </div>

      {results.length > 0 && (
        <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
          {results.map((result) => (
            <button
              key={`${result.provider}-${result.lat}-${result.lng}`}
              type="button"
              onClick={() => choose(result)}
              className="flex w-full items-start gap-2 rounded-lg p-2 text-left hover:bg-indigo-50"
            >
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-500" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2 text-[11px] font-bold text-slate-800">
                  <span>{result.name}</span>
                  <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[8px] text-slate-400">
                    {result.provider === 'amap' ? '高德' : 'OSM'}
                  </span>
                </span>
                <span className="mt-0.5 block line-clamp-2 text-[9px] leading-relaxed text-slate-400">{result.display_name}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      {error && <p className="text-[10px] text-amber-700">{error}</p>}

      <div className="h-48 overflow-hidden rounded-xl border border-white shadow-inner">
        <MapContainer center={[value.lat, value.lng]} zoom={12} zoomControl={false} className="h-full w-full">
          <TileLayer attribution='&copy; <a href="https://carto.com/">CARTO</a>' url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
          <MapController value={value} />
          <ClickPicker onPick={(lat, lng) => void pickOnMap(lat, lng)} />
          <CircleMarker center={[value.lat, value.lng]} radius={9} pathOptions={{ color: '#fff', weight: 3, fillColor: '#4f46e5', fillOpacity: 1 }} />
        </MapContainer>
      </div>

      <div className="flex items-start gap-2 rounded-xl bg-white/75 p-2.5">
        {resolving ? <LoaderCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-indigo-500" /> : <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />}
        <div className="min-w-0">
          <div className="text-[10px] font-bold text-slate-700">{value.city || '已选择地图位置'}</div>
          <div className="mt-0.5 line-clamp-2 text-[9px] leading-relaxed text-slate-400">
            {value.address || '点击地图可微调位置，地址将在保存后用于行程单。'}
          </div>
        </div>
      </div>
    </div>
  );
}
