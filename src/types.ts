/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ItineraryType = 'transport' | 'transfer' | 'hotel' | 'restaurant' | 'sightseeing' | 'leisure' | 'shopping';
export type TransportMode = 'flight' | 'high_speed_rail' | 'train' | 'car' | 'bus' | 'subway' | 'ferry' | 'other';
export type EdgeTransportType = 'walk' | 'car' | 'taxi' | 'transit' | 'bus' | 'subway' | 'train' | 'high_speed_rail' | 'ferry' | 'other';
export type EdgeRoutePreference = 'recommended' | 'fastest' | 'shortest' | 'avoid_tolls' | 'avoid_highways';
export type EdgeDisplayStatus = 'visible' | 'hidden';
export type TripRegion = 'domestic' | 'overseas';
export type MapProvider = 'amap' | 'google';
export type CoordinateSystem = 'gcj02' | 'wgs84';
export type PlaceProvider = MapProvider | 'manual';

export interface ItineraryNode {
  id: string;
  title: string;
  description?: string;
  type: ItineraryType;
  time: string; // e.g., "09:00"
  day: number; // e.g., 1, 2, 3
  date: string; // e.g., "2026-09-26"
  end_time?: string;
  end_day?: number;
  end_date?: string;
  timezone?: string;
  city?: string;
  address?: string;
  image_url?: string;
  image_urls?: string[];
  transport_mode?: TransportMode;
  departure_place?: string;
  arrival_place?: string;
  departure_timezone?: string;
  arrival_timezone?: string;
  departure_lat?: number | null;
  departure_lng?: number | null;
  arrival_lat?: number | null;
  arrival_lng?: number | null;
  place_provider?: PlaceProvider;
  provider_place_id?: string;
  coord_system?: CoordinateSystem;
  departure_place_provider?: PlaceProvider;
  departure_provider_place_id?: string;
  arrival_place_provider?: PlaceProvider;
  arrival_provider_place_id?: string;
  arrival_time?: string;
  arrival_date?: string;
  service_number?: string;
  duration?: string;
  lat: number;
  lng: number;
  status: 'completed' | 'ongoing' | 'planned' | 'unscheduled';
}

export interface ItineraryEdge {
  id: string;
  source: string; // Node ID
  target: string; // Node ID
  transportType?: EdgeTransportType;
  routePreference?: EdgeRoutePreference;
  isManual?: boolean;
  isLocked?: boolean;
  displayStatus?: EdgeDisplayStatus;
  duration?: string; // e.g., "30 mins"
  distance?: string; // e.g., "5.4 km"
}

export interface RouteSegment {
  id: string;
  linkType: 'edge' | 'transport_node';
  linkId: string;
  provider: 'google' | 'amap' | 'manual';
  travelMode: 'drive' | 'walk' | 'transit' | 'flight' | 'other';
  origin_lat: number;
  origin_lng: number;
  destination_lat: number;
  destination_lng: number;
  geometryFormat: 'latlng_json' | 'great_circle';
  geometry: [number, number][];
  coordSystem: CoordinateSystem;
  distanceMeters?: number | null;
  durationSeconds?: number | null;
  distanceText?: string;
  durationText?: string;
  status: 'fresh' | 'fallback' | 'failed';
  expiresAt?: number;
  errorMessage?: string;
  requestedAt?: number;
}

export interface Accommodation {
  name: string;
  dates: string;
  address: string;
  details: string;
  image_url?: string;
}

export interface Trip {
  slug: string;
  title: string;
  subtitle: string;
  start_date: string;
  end_date: string;
  travelers: number;
  origin: string;
  summary: string;
  car: string;
  car_image_url?: string;
  accommodations: Accommodation[];
  trip_region: TripRegion;
  map_provider: MapProvider;
  coord_system: CoordinateSystem;
}

export interface TripSummary extends Trip {
  node_count: number;
  day_count: number;
  center_lat: number;
  center_lng: number;
  cover_image_url?: string;
  cities: string[];
}

export interface TripResponse extends Trip {
  nodes: ItineraryNode[];
  edges: ItineraryEdge[];
  routeSegments?: RouteSegment[];
}
