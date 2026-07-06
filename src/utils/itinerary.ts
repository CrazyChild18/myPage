import { ItineraryNode } from '../types';

export const isScheduledNode = (node: ItineraryNode) =>
  node.status !== 'unscheduled' && node.day > 0 && Boolean(node.date) && Boolean(node.time);

export const isPointNode = (node: ItineraryNode) => node.type !== 'transport';

export const isUnscheduledPointNode = (node: ItineraryNode) =>
  isPointNode(node) && !isScheduledNode(node);

export const compareItineraryNodes = (a: ItineraryNode, b: ItineraryNode) => {
  const aScheduled = isScheduledNode(a);
  const bScheduled = isScheduledNode(b);

  if (aScheduled && bScheduled) {
    return a.day - b.day || a.time.localeCompare(b.time) || a.title.localeCompare(b.title, 'zh-CN');
  }

  if (aScheduled !== bScheduled) return aScheduled ? -1 : 1;

  return a.type.localeCompare(b.type, 'zh-CN') || a.title.localeCompare(b.title, 'zh-CN');
};
