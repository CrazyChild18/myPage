import { CoordinateSystem, MapProvider, Trip, TripRegion } from '../types';

export const mapProviderLabel: Record<MapProvider, string> = {
  amap: '高德地图',
  google: 'Google Maps',
};

export const tripRegionLabel: Record<TripRegion, string> = {
  domestic: '国内',
  overseas: '境外',
};

export const coordSystemForProvider = (provider: MapProvider): CoordinateSystem =>
  provider === 'amap' ? 'gcj02' : 'wgs84';

export const mapProviderForRegion = (region: TripRegion): MapProvider =>
  region === 'domestic' ? 'amap' : 'google';

export const mapProviderForTrip = (trip?: Pick<Trip, 'map_provider' | 'trip_region'> | null): MapProvider =>
  trip?.map_provider || mapProviderForRegion(trip?.trip_region || 'overseas');

export const regionForMapProvider = (provider: MapProvider): TripRegion =>
  provider === 'amap' ? 'domestic' : 'overseas';

export const mapProviderFromRaw = (value?: string | null): MapProvider =>
  value === 'amap' ? 'amap' : 'google';

export const googleMapsBrowserKey = () => import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY || '';
export const amapBrowserKey = () => import.meta.env.VITE_AMAP_JS_API_KEY || '';
export const amapSecurityCode = () => import.meta.env.VITE_AMAP_SECURITY_CODE || '';
