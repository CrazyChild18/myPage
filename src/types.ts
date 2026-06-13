/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ItineraryType = 'transport' | 'transfer' | 'hotel' | 'restaurant' | 'sightseeing' | 'leisure' | 'shopping';
export type TransportMode = 'flight' | 'high_speed_rail' | 'train' | 'bus' | 'ferry' | 'other';

export interface ItineraryNode {
  id: string;
  title: string;
  description?: string;
  type: ItineraryType;
  time: string; // e.g., "09:00"
  day: number; // e.g., 1, 2, 3
  date: string; // e.g., "2026-09-26"
  city?: string;
  address?: string;
  image_url?: string;
  image_urls?: string[];
  transport_mode?: TransportMode;
  departure_place?: string;
  arrival_place?: string;
  departure_lat?: number | null;
  departure_lng?: number | null;
  arrival_lat?: number | null;
  arrival_lng?: number | null;
  arrival_time?: string;
  arrival_date?: string;
  service_number?: string;
  duration?: string;
  lat: number;
  lng: number;
  status: 'completed' | 'ongoing' | 'planned';
}

export interface ItineraryEdge {
  id: string;
  source: string; // Node ID
  target: string; // Node ID
  transportType?: 'walk' | 'car' | 'train' | 'flight' | 'other';
  duration?: string; // e.g., "30 mins"
  distance?: string; // e.g., "5.4 km"
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
}
