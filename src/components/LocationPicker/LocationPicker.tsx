import React, { useEffect, useRef, useState } from 'react';
import { Check, Globe2, LoaderCircle, MapIcon, MapPin, Search } from 'lucide-react';
import { CoordinateSystem, MapProvider, PlaceProvider } from '../../types';
import { gcj02ToWgs84, isInMainlandChina, toProviderPoint } from '../../map/coordinates';
import { amapBrowserKey, amapSecurityCode, mapProviderLabel } from '../../map/provider';
import { googleMapsBrowserKey } from '../../map/provider';
import { loadAmap, loadGoogleMaps } from '../../map/scriptLoaders';

type LocationProvider = MapProvider | 'osm';

export interface LocationValue {
  lat: number;
  lng: number;
  city?: string;
  address?: string;
  title?: string;
  place_provider?: PlaceProvider;
  provider_place_id?: string;
  coord_system?: CoordinateSystem;
}

interface SearchResult {
  name: string;
  display_name: string;
  lat: number;
  lng: number;
  city: string;
  provider: LocationProvider;
  provider_place_id?: string;
  coord_system?: CoordinateSystem;
}

interface LocationPickerProps {
  value: LocationValue;
  onChange: (value: LocationValue) => void;
  compact?: boolean;
  provider?: MapProvider;
  allowProviderSwitch?: boolean;
  regionCode?: string;
}

type ProviderMiniMapProps = {
  value: LocationValue;
  provider: MapProvider;
  onPick: (lat: number, lng: number) => void;
};

const ProviderMiniMap: React.FC<ProviderMiniMapProps> = ({
  value,
  provider,
  onPick,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!containerRef.current) return;
    setError(null);

    if (provider === 'google') {
      loadGoogleMaps(googleMapsBrowserKey())
        .then((maps) => {
          if (cancelled || !containerRef.current) return;
          if (!mapRef.current) {
            mapRef.current = new maps.Map(containerRef.current, {
              center: { lat: value.lat, lng: value.lng },
              zoom: 13,
              mapTypeControl: false,
              streetViewControl: false,
              fullscreenControl: false,
              clickableIcons: false,
            });
            mapRef.current.addListener('click', (event: any) => {
              if (event.latLng) onPick(event.latLng.lat(), event.latLng.lng());
            });
          }
          mapRef.current.setCenter({ lat: value.lat, lng: value.lng });
          if (!markerRef.current) {
            markerRef.current = new maps.Marker({
              map: mapRef.current,
              position: { lat: value.lat, lng: value.lng },
            });
          } else {
            markerRef.current.setPosition({ lat: value.lat, lng: value.lng });
          }
        })
        .catch((reason) => !cancelled && setError(reason instanceof Error ? reason.message : 'Google 地图加载失败'));
    } else {
      loadAmap(amapBrowserKey(), amapSecurityCode())
        .then((AMap) => {
          if (cancelled || !containerRef.current) return;
          const [gcjLat, gcjLng] = toProviderPoint(value.lat, value.lng, 'amap');
          if (!mapRef.current) {
            mapRef.current = new AMap.Map(containerRef.current, {
              center: [gcjLng, gcjLat],
              zoom: 13,
              viewMode: '2D',
            });
            mapRef.current.on('click', (event: any) => {
              const [wgsLat, wgsLng] = gcj02ToWgs84(event.lnglat.lat, event.lnglat.lng);
              onPick(wgsLat, wgsLng);
            });
          }
          mapRef.current.setCenter([gcjLng, gcjLat]);
          if (!markerRef.current) {
            markerRef.current = new AMap.Marker({ map: mapRef.current, position: [gcjLng, gcjLat] });
          } else {
            markerRef.current.setPosition([gcjLng, gcjLat]);
          }
        })
        .catch((reason) => !cancelled && setError(reason instanceof Error ? reason.message : '高德地图加载失败'));
    }

    return () => {
      cancelled = true;
    };
  }, [onPick, provider, value.lat, value.lng]);

  return (
    <div className="relative h-48 overflow-hidden rounded-xl border border-white shadow-inner">
      <div ref={containerRef} className="h-full w-full" />
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/70 px-6 text-center text-[10px] font-bold text-white backdrop-blur-sm">
          <MapPin className="mb-2 h-5 w-5 text-indigo-200" />
          <span>{error}</span>
          <span className="mt-1 text-[9px] font-medium text-slate-300">仍可通过搜索选择地点</span>
        </div>
      )}
    </div>
  );
};

export default function LocationPicker({ value, onChange, compact = false, provider: forcedProvider, allowProviderSwitch = false, regionCode = '' }: LocationPickerProps) {
  const [localProvider, setLocalProvider] = useState<MapProvider>(() => (isInMainlandChina(value.lat, value.lng) ? 'amap' : 'google'));
  const provider = forcedProvider || localProvider;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchSeqRef = useRef(0);

  const switchProvider = (nextProvider: MapProvider) => {
    if (forcedProvider && !allowProviderSwitch) return;
    searchSeqRef.current += 1;
    setLocalProvider(nextProvider);
    setResults([]);
    setSearching(false);
    setError(null);
  };

  const updateQuery = (nextQuery: string) => {
    searchSeqRef.current += 1;
    setQuery(nextQuery);
    setResults([]);
    setSearching(false);
    setError(null);
  };

  const search = async () => {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 2) {
      setError('请至少输入 2 个字符');
      return;
    }

    const searchSeq = searchSeqRef.current + 1;
    searchSeqRef.current = searchSeq;
    setSearching(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        q: normalizedQuery,
        provider,
        region: regionCode,
        lat: String(value.lat),
        lng: String(value.lng),
        cache: '0',
      });
      const response = await fetch(`/api/geocode/search?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '地点搜索失败');
      if (searchSeqRef.current !== searchSeq) return;
      setResults(data);
      if (!data.length) setError('没有找到匹配地点，可以直接点击地图选位置');
    } catch (reason) {
      if (searchSeqRef.current !== searchSeq) return;
      setError(reason instanceof Error ? reason.message : '地点搜索失败');
    } finally {
      if (searchSeqRef.current === searchSeq) setSearching(false);
    }
  };

  const choose = (result: SearchResult) => {
    searchSeqRef.current += 1;
    onChange({
      lat: result.lat,
      lng: result.lng,
      city: result.city,
      address: result.display_name,
      title: result.name,
      place_provider: result.provider === 'osm' ? 'manual' : result.provider,
      provider_place_id: result.provider_place_id,
      coord_system: result.coord_system || 'wgs84',
    });
    setQuery(result.name);
    setResults([]);
    setSearching(false);
  };

  const pickOnMap = async (lat: number, lng: number) => {
    onChange({ ...value, lat, lng });
    setResolving(true);
    setError(null);
    try {
      const response = await fetch(`/api/geocode/reverse?lat=${lat}&lng=${lng}&provider=${provider}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '地址解析失败');
      onChange({
        ...value,
        lat,
        lng,
        city: data.city || value.city,
        address: data.display_name || value.address,
        place_provider: data.provider === 'osm' ? 'manual' : data.provider,
        provider_place_id: data.provider_place_id || value.provider_place_id,
        coord_system: data.coord_system || 'wgs84',
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '已选择位置，但地址解析失败');
    } finally {
      setResolving(false);
    }
  };

  const providerLabel = mapProviderLabel[provider];

  return (
    <div className="space-y-3 rounded-2xl border border-indigo-100 bg-indigo-50/45 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
          <MapPin className="h-3.5 w-3.5 text-indigo-600" />
          选择地点
        </span>
        {forcedProvider && !allowProviderSwitch ? (
          <span className="flex items-center gap-1.5 rounded-lg border border-indigo-100 bg-white/80 px-2.5 py-1.5 text-[10px] font-black text-indigo-700">
            {provider === 'amap' ? <MapIcon className="h-3 w-3" /> : <Globe2 className="h-3 w-3" />}
            {providerLabel}
          </span>
        ) : (
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
              onClick={() => switchProvider('google')}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 transition ${provider === 'google' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-indigo-700'}`}
            >
              <Globe2 className="h-3 w-3" /> 境外
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => updateQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void search();
              }
            }}
            placeholder={provider === 'amap' ? '搜索国内景点、酒店或地址' : '中文搜索海外景点、酒店或地址'}
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
                    {result.provider === 'amap' ? '高德' : result.provider === 'google' ? 'Google' : '手动'}
                  </span>
                </span>
                <span className="mt-0.5 block line-clamp-2 text-[9px] leading-relaxed text-slate-400">{result.display_name}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      {error && <p className="text-[10px] text-amber-700">{error}</p>}

      {!compact && <ProviderMiniMap key={provider} value={value} provider={provider} onPick={(lat, lng) => void pickOnMap(lat, lng)} />}

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
