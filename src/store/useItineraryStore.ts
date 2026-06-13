import { create } from 'zustand';
import { ItineraryEdge, ItineraryNode, Trip, TripResponse } from '../types';

const TRIP_SLUG = 'iceland-2026';
const API_ROOT = `/api/trips/${TRIP_SLUG}`;

interface ItineraryState {
  trip: Trip | null;
  nodes: ItineraryNode[];
  edges: ItineraryEdge[];
  activeNodeId: string | null;
  hoveredEdgeId: string | null;
  activeDay: number | 'all';
  loading: boolean;
  saving: boolean;
  error: string | null;

  loadTrip: () => Promise<void>;
  resetTrip: () => Promise<void>;
  addNode: (node: ItineraryNode) => Promise<void>;
  updateNode: (id: string, updatedFields: Partial<ItineraryNode>) => Promise<void>;
  deleteNode: (id: string) => Promise<void>;
  setActiveNodeId: (id: string | null) => void;
  setHoveredEdgeId: (id: string | null) => void;
  setActiveDay: (day: number | 'all') => void;
  autoConnectEdges: () => Promise<void>;
}

const tripOnly = ({ nodes: _nodes, edges: _edges, ...trip }: TripResponse): Trip => trip;

const request = async <T>(url: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
    ...options,
  });
  if (!response.ok) {
    const message = await response.json().catch(() => ({ error: '请求失败' }));
    throw new Error(message.error || `请求失败 (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
};

const applyTrip = (data: TripResponse) => ({
  trip: tripOnly(data),
  nodes: data.nodes,
  edges: data.edges,
  activeNodeId: data.nodes[0]?.id || null,
  activeDay: data.nodes[0]?.day || 1,
  loading: false,
  saving: false,
  error: null,
});

export const useItineraryStore = create<ItineraryState>((set, get) => ({
  trip: null,
  nodes: [],
  edges: [],
  activeNodeId: null,
  hoveredEdgeId: null,
  activeDay: 1,
  loading: true,
  saving: false,
  error: null,

  loadTrip: async () => {
    set({ loading: true, error: null });
    try {
      set(applyTrip(await request<TripResponse>(API_ROOT)));
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : '加载行程失败' });
    }
  },

  resetTrip: async () => {
    set({ saving: true, error: null });
    try {
      set(applyTrip(await request<TripResponse>(`${API_ROOT}/reset`, { method: 'POST' })));
    } catch (error) {
      set({ saving: false, error: error instanceof Error ? error.message : '重置行程失败' });
      throw error;
    }
  },

  addNode: async (node) => {
    set({ saving: true, error: null });
    try {
      const created = await request<ItineraryNode>(`${API_ROOT}/nodes`, {
        method: 'POST',
        body: JSON.stringify(node),
      });
      set((state) => ({
        nodes: [...state.nodes, created].sort((a, b) => a.day - b.day || a.time.localeCompare(b.time)),
        activeNodeId: created.id,
        saving: false,
      }));
    } catch (error) {
      set({ saving: false, error: error instanceof Error ? error.message : '添加节点失败' });
      throw error;
    }
  },

  updateNode: async (id, updatedFields) => {
    const current = get().nodes.find((node) => node.id === id);
    if (!current) return;
    const optimistic = { ...current, ...updatedFields };
    set((state) => ({
      nodes: state.nodes.map((node) => node.id === id ? optimistic : node)
        .sort((a, b) => a.day - b.day || a.time.localeCompare(b.time)),
      saving: true,
      error: null,
    }));
    try {
      const updated = await request<ItineraryNode>(`${API_ROOT}/nodes/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updatedFields),
      });
      set((state) => ({
        nodes: state.nodes.map((node) => node.id === id ? updated : node)
          .sort((a, b) => a.day - b.day || a.time.localeCompare(b.time)),
        saving: false,
      }));
    } catch (error) {
      set((state) => ({
        nodes: state.nodes.map((node) => node.id === id ? current : node),
        saving: false,
        error: error instanceof Error ? error.message : '更新节点失败',
      }));
      throw error;
    }
  },

  deleteNode: async (id) => {
    set({ saving: true, error: null });
    try {
      await request<void>(`${API_ROOT}/nodes/${id}`, { method: 'DELETE' });
      set((state) => {
        const nodes = state.nodes.filter((node) => node.id !== id);
        return {
          nodes,
          edges: state.edges.filter((edge) => edge.source !== id && edge.target !== id),
          activeNodeId: state.activeNodeId === id ? nodes[0]?.id || null : state.activeNodeId,
          saving: false,
        };
      });
    } catch (error) {
      set({ saving: false, error: error instanceof Error ? error.message : '删除节点失败' });
      throw error;
    }
  },

  setActiveNodeId: (id) => set({ activeNodeId: id }),
  setHoveredEdgeId: (id) => set({ hoveredEdgeId: id }),
  setActiveDay: (day) => set((state) => {
    const firstNode = state.nodes.find((node) => day === 'all' || node.day === day);
    return { activeDay: day, activeNodeId: firstNode?.id || state.activeNodeId };
  }),

  autoConnectEdges: async () => {
    set({ saving: true, error: null });
    try {
      const data = await request<TripResponse>(`${API_ROOT}/auto-connect`, { method: 'POST' });
      set({ edges: data.edges, saving: false });
    } catch (error) {
      set({ saving: false, error: error instanceof Error ? error.message : '重建路线失败' });
      throw error;
    }
  },
}));
