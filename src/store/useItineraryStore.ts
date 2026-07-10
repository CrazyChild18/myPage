import { create } from 'zustand';
import { ItineraryEdge, ItineraryNode, Lodging, RouteSegment, Stay, Trip, TripResponse } from '../types';
import { compareItineraryNodes, isScheduledNode } from '../utils/itinerary';

interface ItineraryState {
  selectedTripSlug: string | null;
  trip: Trip | null;
  nodes: ItineraryNode[];
  edges: ItineraryEdge[];
  routeSegments: RouteSegment[];
  lodgings: Lodging[];
  stays: Stay[];
  activeNodeId: string | null;
  activeEdgeId: string | null;
  hoveredEdgeId: string | null;
  activeDay: number | 'all';
  loading: boolean;
  saving: boolean;
  syncingNodeIds: string[];
  error: string | null;

  loadTrip: (slug: string) => Promise<void>;
  clearTrip: () => void;
  resetTrip: () => Promise<void>;
  addNode: (node: ItineraryNode) => Promise<void>;
  updateNode: (id: string, updatedFields: Partial<ItineraryNode>) => Promise<void>;
  updateEdge: (id: string, updatedFields: Partial<ItineraryEdge>) => Promise<void>;
  deleteNode: (id: string) => Promise<void>;
  saveLodging: (lodging: Lodging) => Promise<void>;
  deleteLodging: (id: string) => Promise<void>;
  saveStay: (stay: Stay) => Promise<void>;
  deleteStay: (id: string) => Promise<void>;
  setActiveNodeId: (id: string | null) => void;
  setActiveEdgeId: (id: string | null) => void;
  setHoveredEdgeId: (id: string | null) => void;
  setActiveDay: (day: number | 'all') => void;
  autoConnectEdges: () => Promise<void>;
}

const tripOnly = ({
  nodes: _nodes,
  edges: _edges,
  routeSegments: _routeSegments,
  lodgings: _lodgings,
  stays: _stays,
  ...trip
}: TripResponse): Trip => trip;

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
  selectedTripSlug: data.slug,
  trip: tripOnly(data),
  nodes: [...data.nodes].sort(compareItineraryNodes),
  edges: data.edges,
  routeSegments: data.routeSegments || [],
  lodgings: data.lodgings || [],
  stays: data.stays || [],
  activeNodeId: null,
  activeEdgeId: null,
  activeDay: 'all' as const,
  loading: false,
  saving: false,
  syncingNodeIds: [],
  error: null,
});

let loadSequence = 0;

export const useItineraryStore = create<ItineraryState>((set, get) => ({
  selectedTripSlug: null,
  trip: null,
  nodes: [],
  edges: [],
  routeSegments: [],
  lodgings: [],
  stays: [],
  activeNodeId: null,
  activeEdgeId: null,
  hoveredEdgeId: null,
  activeDay: 'all',
  loading: false,
  saving: false,
  syncingNodeIds: [],
  error: null,

  loadTrip: async (slug) => {
    const sequence = ++loadSequence;
    set({ loading: true, error: null });
    try {
      const data = await request<TripResponse>(`/api/trips/${slug}?include_routes=0`);
      if (sequence !== loadSequence) return;
      set(applyTrip(data));
      try {
        const routeSegments = await request<RouteSegment[]>(`/api/trips/${slug}/route-segments`);
        if (sequence !== loadSequence || get().selectedTripSlug !== slug) return;
        set({ routeSegments });
      } catch (routeError) {
        if (sequence !== loadSequence || get().selectedTripSlug !== slug) return;
        set({ error: routeError instanceof Error ? `路线加载失败：${routeError.message}` : '路线加载失败' });
      }
    } catch (error) {
      if (sequence !== loadSequence) return;
      set({ loading: false, error: error instanceof Error ? error.message : '加载行程失败' });
    }
  },

  clearTrip: () => {
    loadSequence += 1;
    set({
      selectedTripSlug: null,
      trip: null,
      nodes: [],
      edges: [],
      routeSegments: [],
      lodgings: [],
      stays: [],
      activeNodeId: null,
      activeEdgeId: null,
      activeDay: 'all',
      loading: false,
      saving: false,
      syncingNodeIds: [],
      error: null,
    });
  },

  resetTrip: async () => {
    const slug = get().selectedTripSlug;
    if (!slug) return;
    set({ saving: true, error: null });
    try {
      set(applyTrip(await request<TripResponse>(`/api/trips/${slug}/reset`, { method: 'POST' })));
    } catch (error) {
      set({ saving: false, error: error instanceof Error ? error.message : '重置行程失败' });
      throw error;
    }
  },

  addNode: async (node) => {
    const slug = get().selectedTripSlug;
    if (!slug) return;
    set({ saving: true, error: null });
    try {
      const created = await request<ItineraryNode>(`/api/trips/${slug}/nodes`, {
        method: 'POST',
        body: JSON.stringify(node),
      });
      set((state) => ({
        nodes: [...state.nodes, created].sort(compareItineraryNodes),
        activeNodeId: created.id,
        activeEdgeId: null,
        saving: false,
      }));
    } catch (error) {
      set({ saving: false, error: error instanceof Error ? error.message : '添加节点失败' });
      throw error;
    }
  },

  updateNode: async (id, updatedFields) => {
    const slug = get().selectedTripSlug;
    if (!slug) return;
    const current = get().nodes.find((node) => node.id === id);
    if (!current) return;
    const optimistic = { ...current, ...updatedFields };
    set((state) => ({
      nodes: state.nodes.map((node) => node.id === id ? optimistic : node)
        .sort(compareItineraryNodes),
      activeEdgeId: null,
      saving: true,
      syncingNodeIds: state.syncingNodeIds.includes(id) ? state.syncingNodeIds : [...state.syncingNodeIds, id],
      error: null,
    }));
    try {
      const updated = await request<ItineraryNode>(`/api/trips/${slug}/nodes/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updatedFields),
      });
      set((state) => {
        const syncingNodeIds = state.syncingNodeIds.filter((nodeId) => nodeId !== id);
        return {
          nodes: state.nodes.map((node) => node.id === id ? updated : node)
            .sort(compareItineraryNodes),
          activeEdgeId: null,
          syncingNodeIds,
          saving: syncingNodeIds.length > 0,
        };
      });
    } catch (error) {
      set((state) => {
        const syncingNodeIds = state.syncingNodeIds.filter((nodeId) => nodeId !== id);
        return {
          nodes: state.nodes.map((node) => node.id === id ? current : node),
          syncingNodeIds,
          saving: syncingNodeIds.length > 0,
          error: error instanceof Error ? error.message : '更新节点失败',
        };
      });
      throw error;
    }
  },

  updateEdge: async (id, updatedFields) => {
    const slug = get().selectedTripSlug;
    if (!slug) return;
    const current = get().edges.find((edge) => edge.id === id);
    if (!current) return;
    const optimistic = { ...current, ...updatedFields };
    set((state) => ({
      edges: state.edges.map((edge) => edge.id === id ? optimistic : edge),
      activeEdgeId: id,
      activeNodeId: null,
      saving: true,
      error: null,
    }));
    try {
      const data = await request<TripResponse>(`/api/trips/${slug}/edges/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updatedFields),
      });
      set({
        edges: data.edges,
        routeSegments: data.routeSegments || [],
        activeEdgeId: id,
        activeNodeId: null,
        saving: false,
      });
    } catch (error) {
      set((state) => ({
        edges: state.edges.map((edge) => edge.id === id ? current : edge),
        saving: false,
        error: error instanceof Error ? error.message : '更新路段失败',
      }));
      throw error;
    }
  },

  deleteNode: async (id) => {
    const slug = get().selectedTripSlug;
    if (!slug) return;
    set({ saving: true, error: null });
    try {
      await request<void>(`/api/trips/${slug}/nodes/${id}`, { method: 'DELETE' });
      set((state) => {
        const nodes = state.nodes.filter((node) => node.id !== id);
        return {
          nodes,
          edges: state.edges.filter((edge) => edge.source !== id && edge.target !== id),
          routeSegments: state.routeSegments.filter((segment) => {
            if (segment.linkType === 'transport_node') return segment.linkId !== id;
            const edge = state.edges.find((item) => item.id === segment.linkId);
            return edge && edge.source !== id && edge.target !== id;
          }),
          activeNodeId: state.activeNodeId === id ? null : state.activeNodeId,
          activeEdgeId: state.activeEdgeId && state.edges.some((edge) => edge.id === state.activeEdgeId && (edge.source === id || edge.target === id))
            ? null
            : state.activeEdgeId,
          saving: false,
        };
      });
    } catch (error) {
      set({ saving: false, error: error instanceof Error ? error.message : '删除节点失败' });
      throw error;
    }
  },

  saveLodging: async (lodging) => {
    const slug = get().selectedTripSlug;
    if (!slug) return;
    const exists = get().lodgings.some((item) => item.id === lodging.id);
    set({ saving: true, error: null });
    try {
      const data = await request<TripResponse>(
        exists ? `/api/trips/${slug}/lodgings/${lodging.id}` : `/api/trips/${slug}/lodgings`,
        {
          method: exists ? 'PUT' : 'POST',
          body: JSON.stringify(lodging),
        },
      );
      set({ ...applyTrip(data), activeDay: get().activeDay, activeNodeId: get().activeNodeId });
    } catch (error) {
      set({ saving: false, error: error instanceof Error ? error.message : '保存住宿失败' });
      throw error;
    }
  },

  deleteLodging: async (id) => {
    const slug = get().selectedTripSlug;
    if (!slug) return;
    set({ saving: true, error: null });
    try {
      set({ ...applyTrip(await request<TripResponse>(`/api/trips/${slug}/lodgings/${id}`, { method: 'DELETE' })), activeDay: get().activeDay });
    } catch (error) {
      set({ saving: false, error: error instanceof Error ? error.message : '删除住宿失败' });
      throw error;
    }
  },

  saveStay: async (stay) => {
    const slug = get().selectedTripSlug;
    if (!slug) return;
    const exists = get().stays.some((item) => item.id === stay.id);
    set({ saving: true, error: null });
    try {
      const data = await request<TripResponse>(
        exists ? `/api/trips/${slug}/stays/${stay.id}` : `/api/trips/${slug}/stays`,
        {
          method: exists ? 'PUT' : 'POST',
          body: JSON.stringify(stay),
        },
      );
      set({ ...applyTrip(data), activeDay: get().activeDay, activeNodeId: get().activeNodeId });
    } catch (error) {
      set({ saving: false, error: error instanceof Error ? error.message : '保存入住区间失败' });
      throw error;
    }
  },

  deleteStay: async (id) => {
    const slug = get().selectedTripSlug;
    if (!slug) return;
    set({ saving: true, error: null });
    try {
      set({ ...applyTrip(await request<TripResponse>(`/api/trips/${slug}/stays/${id}`, { method: 'DELETE' })), activeDay: get().activeDay });
    } catch (error) {
      set({ saving: false, error: error instanceof Error ? error.message : '删除入住区间失败' });
      throw error;
    }
  },

  setActiveNodeId: (id) => set({ activeNodeId: id, activeEdgeId: null }),
  setActiveEdgeId: (id) => set({ activeEdgeId: id, activeNodeId: null }),
  setHoveredEdgeId: (id) => set({ hoveredEdgeId: id }),
  setActiveDay: (day) => set((state) => {
    const activeNode = state.nodes.find((node) => node.id === state.activeNodeId);
    const activeNodeVisible = activeNode && isScheduledNode(activeNode) && (day === 'all' || activeNode.day === day);
    return { activeDay: day, activeNodeId: activeNodeVisible ? state.activeNodeId : null, activeEdgeId: null };
  }),

  autoConnectEdges: async () => {
    const slug = get().selectedTripSlug;
    if (!slug) return;
    set({ saving: true, error: null });
    try {
      const data = await request<TripResponse>(`/api/trips/${slug}/auto-connect`, { method: 'POST' });
      set({ edges: data.edges, routeSegments: data.routeSegments || [], saving: false });
    } catch (error) {
      set({ saving: false, error: error instanceof Error ? error.message : '重建路线失败' });
      throw error;
    }
  },
}));
