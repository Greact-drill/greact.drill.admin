import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  getSmoothStepPath,
  type Edge as FlowEdge,
  type EdgeProps as FlowEdgeProps,
  type Node as FlowNode,
  type NodeProps as FlowNodeProps,
  type OnSelectionChangeFunc,
  type ReactFlowInstance,
} from '@xyflow/react';
import { Button } from 'primereact/button';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { Message } from 'primereact/message';
import { Dropdown } from 'primereact/dropdown';
import {
  createTagCustomization,
  createEdgeCustomization,
  deleteTagCustomization,
  deleteEdgeCustomization,
  getAllWidgetConfigs,
  getDiagramConfigByPage,
  getTagsForAdmin,
  updateEdgeCustomization,
  type Edge,
  type Tag,
} from '../api/admin';
import DiagramDecorationPreview from './DiagramDecorationPreview';
import PageHeader from '../ui/PageHeader';
import AppCard from '../ui/AppCard';
import {
  getSchemeWidgetDefinition,
  isSchemeWidgetType,
  SCHEME_WIDGET_LIBRARY,
  type SchemeWidgetType,
} from '../lib/schemeWidgets';
import {
  createDefaultDiagramDecorationNode,
  createEmptyDiagramPageConfig,
  DIAGRAM_DECORATION_LIBRARY,
  getDiagramDecorationDefinition,
  getDiagramPageCustomizationKey,
  getDiagramPageOwnerEdgeId,
  normalizeDiagramPageConfig,
  serializeDiagramPageConfig,
  type DiagramDecorationEdge,
  type DiagramDecorationEdgeKind,
  type DiagramDecorationNode,
  type DiagramDecorationNodeType,
  type DiagramNodeAnchorSide,
  type DiagramPageConfig,
  type DiagramPoint,
} from '../lib/diagramPageConfig';
import { getErrorMessage } from '../utils/errorUtils';
import { getFilteredAndSortedTags, sortTagsByName } from '../utils/tagUtils';
import EdgePathDisplay from './EdgePathDisplay';
import EdgeTreeSelector from './EdgeTreeSelector';
import SchemeWidgetPreview from './SchemeWidgetPreview';
import '@xyflow/react/dist/style.css';
import './DiagramWidgetsPage.css';

interface DiagramWidgetConfig {
  page: string;
  widgetType: SchemeWidgetType;
  position: { x: number; y: number };
  /** Отрицательные/положительные — порядок относительно других узлов; 0 или не задано = базовый слой виджета. */
  zIndex?: number;
  customLabel?: string;
  displayType?: 'widget' | 'compact' | 'card';
  connections?: DiagramConnection[];
}

interface DiagramLayoutItem extends DiagramWidgetConfig {
  id: string;
  edge_id: string;
  tag_id: string;
}

type DiagramConnectionKind = 'power' | 'signal' | 'alert';

interface DiagramConnection {
  targetTagId: string;
  kind: DiagramConnectionKind;
}

interface SmartSnapGuides {
  x?: number;
  y?: number;
}

interface DiagramWidgetFlowNodeData {
  kind: 'widget';
  item: DiagramLayoutItem;
  tagName: string;
  hasAlarm: boolean;
  onEditWidget: (item: DiagramLayoutItem) => void;
  onDeleteNode: (id: string) => void;
  onDuplicateNode: (id: string) => void;
  onOpenContextMenu: (payload: { id: string; x: number; y: number }) => void;
}

interface DiagramDecorationFlowNodeData {
  kind: 'decoration';
  item: DiagramDecorationNode;
  title: string;
  subtitle: string;
  onEditDecoration: (item: DiagramDecorationNode) => void;
  onDeleteNode: (id: string) => void;
  onDuplicateNode: (id: string) => void;
  onOpenContextMenu: (payload: { id: string; x: number; y: number }) => void;
}

type DiagramFlowNodeData = DiagramWidgetFlowNodeData | DiagramDecorationFlowNodeData;

interface DiagramFlowEdgeData {
  kind: DiagramConnectionKind | DiagramDecorationEdgeKind;
  decoration?: boolean;
  waypoints?: DiagramPoint[];
}

interface LayoutHistoryEntry {
  layouts: DiagramLayoutItem[];
  pageConfig: DiagramPageConfig;
  selectedWidgetIds: string[];
}

interface DiagramCanvasGuides {
  x?: number;
  y?: number;
}

const CONNECTION_KIND_OPTIONS: Array<{ value: DiagramConnectionKind; label: string }> = [
  { value: 'power', label: 'Силовая' },
  { value: 'signal', label: 'Сигнальная' },
  { value: 'alert', label: 'Аварийная' },
];

interface Props {
  title: string;
}

const CANVAS_LIMITS = {
  width: 2200,
  height: 1200,
};

const CANVAS_UNBOUNDED_Y = 1_000_000;
const ADMIN_PREVIEW_SCALE = 0.82;
/** ViewBox всех символов в `SchemeWidgetPreview` — как при `preserveAspectRatio="meet"` внутри прямоугольника definition. */
const SNAP_THRESHOLD = 14;
const GRID_OFFSET = 16;
/** Совпадают с DynamicSchemeCanvas во view (fitView / zoom limits). */
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 1.45;
const AUTOSAVE_DELAY_MS = 500;
const MAX_HISTORY_ENTRIES = 40;
const DEFAULT_GRID_STEP = 8;

function clampWidgetPosition(position: { x: number; y: number }, widgetType: SchemeWidgetType) {
  const definition = getSchemeWidgetDefinition(widgetType);

  return {
    x: Math.max(GRID_OFFSET, Math.min(Math.round(position.x), CANVAS_LIMITS.width - definition.width - GRID_OFFSET)),
    y: Math.max(GRID_OFFSET, Math.round(position.y)),
  };
}

function normalizeWidgetPosition(position: { x: number; y: number }, widgetType: SchemeWidgetType) {
  return clampWidgetPosition(position, widgetType);
}

function clampZoomValue(value: number) {
  return Math.max(MIN_ZOOM, Math.min(Number(value.toFixed(2)), MAX_ZOOM));
}

/** Как во view (`DynamicSchemeCanvas`): definition × FLOW_SCALE — тот же центр, что на странице просмотра. */
function getAdminPreviewDimensions(widgetType: SchemeWidgetType) {
  const definition = getSchemeWidgetDefinition(widgetType);

  return {
    width: Math.round(definition.width * ADMIN_PREVIEW_SCALE),
    height: Math.round(definition.height * ADMIN_PREVIEW_SCALE),
  };
}

/** Как `DynamicSchemeCanvas.getDecorationDimensions` во view: полный bbox × FLOW_SCALE. */
function getDecorationCanvasDimensions(item: Pick<DiagramDecorationNode, 'width' | 'height'>) {
  return {
    width: Math.max(48, Math.round(item.width * ADMIN_PREVIEW_SCALE)),
    height: Math.max(32, Math.round(item.height * ADMIN_PREVIEW_SCALE)),
  };
}

/** Как `DynamicSchemeCanvas.getDecorationLayerZIndex` во view: рамка области по умолчанию ниже виджетов. */
function getDecorationLayerZIndex(item: Pick<DiagramDecorationNode, 'type' | 'zIndex'>) {
  if (typeof item.zIndex === 'number' && item.zIndex !== 0) {
    return item.zIndex;
  }

  return item.type === 'regionFrame' ? -10 : 0;
}

/** Базовый слой схемных виджетов совпадает со view: поверх декораций с отрицательным z (например область −10). */
function getWidgetFlowLayerZIndex(item: Pick<DiagramWidgetConfig, 'zIndex'>) {
  if (typeof item.zIndex === 'number' && item.zIndex !== 0) {
    return item.zIndex;
  }

  return 0;
}

function clampCanvasPosition(position: { x: number; y: number }, size: { width: number; height: number }) {
  return {
    x: Math.max(GRID_OFFSET, Math.min(Math.round(position.x), CANVAS_LIMITS.width - size.width - GRID_OFFSET)),
    y: Math.max(GRID_OFFSET, Math.round(position.y)),
  };
}

function normalizeDecorationPosition(position: { x: number; y: number }, item: Pick<DiagramDecorationNode, 'width' | 'height'>) {
  return clampCanvasPosition(position, item);
}

function getScaledCanvasPosition(position: { x: number; y: number }) {
  return {
    x: Math.round(position.x * ADMIN_PREVIEW_SCALE),
    y: Math.round(position.y * ADMIN_PREVIEW_SCALE),
  };
}

function getFlowNodeCenterFromWidget(position: { x: number; y: number }, widgetType: SchemeWidgetType) {
  const scaled = getScaledCanvasPosition(position);
  const dimensions = getAdminPreviewDimensions(widgetType);

  return {
    x: scaled.x + dimensions.width / 2,
    y: scaled.y + dimensions.height / 2,
  };
}

function getFlowNodeCenterFromDecoration(item: DiagramDecorationNode) {
  const scaled = getScaledCanvasPosition(item.position);
  const dimensions = getDecorationCanvasDimensions(item);

  return {
    x: scaled.x + (dimensions.width / 2),
    y: scaled.y + (dimensions.height / 2),
  };
}

function getWidgetPositionFromFlowNodeCenter(center: { x: number; y: number }, widgetType: SchemeWidgetType) {
  const dimensions = getAdminPreviewDimensions(widgetType);

  return {
    x: (center.x - dimensions.width / 2) / ADMIN_PREVIEW_SCALE,
    y: (center.y - dimensions.height / 2) / ADMIN_PREVIEW_SCALE,
  };
}

function clampFlowNodeCenterPosition(center: { x: number; y: number }, widgetType: SchemeWidgetType) {
  const dimensions = getAdminPreviewDimensions(widgetType);

  return {
    x: Math.max(dimensions.width / 2, Math.min(center.x, CANVAS_LIMITS.width * ADMIN_PREVIEW_SCALE - dimensions.width / 2)),
    y: Math.max(dimensions.height / 2, center.y),
  };
}

function getDecorationPositionFromFlowNodeCenter(center: { x: number; y: number }, item: DiagramDecorationNode) {
  const dimensions = getDecorationCanvasDimensions(item);

  return {
    x: (center.x - (dimensions.width / 2)) / ADMIN_PREVIEW_SCALE,
    y: (center.y - (dimensions.height / 2)) / ADMIN_PREVIEW_SCALE,
  };
}

function clampDecorationFlowNodeCenterPosition(center: { x: number; y: number }, item: DiagramDecorationNode) {
  const dimensions = getDecorationCanvasDimensions(item);

  return {
    x: Math.max(dimensions.width / 2, Math.min(center.x, CANVAS_LIMITS.width * ADMIN_PREVIEW_SCALE - (dimensions.width / 2))),
    y: Math.max(dimensions.height / 2, center.y),
  };
}

function cloneLayoutItem(item: DiagramLayoutItem): DiagramLayoutItem {
  return {
    ...item,
    position: { ...item.position },
    connections: item.connections?.map((connection) => ({ ...connection })) ?? [],
  };
}

function cloneLayouts(items: DiagramLayoutItem[]) {
  return items.map(cloneLayoutItem);
}

function cloneDecorationNode(item: DiagramDecorationNode): DiagramDecorationNode {
  return {
    ...item,
    position: { ...item.position },
    style: item.style ? { ...item.style } : undefined,
    data: item.data ? { ...item.data } : undefined,
  };
}

function cloneDecorationEdge(item: DiagramDecorationEdge): DiagramDecorationEdge {
  return {
    ...item,
    waypoints: item.waypoints?.map((point) => ({ ...point })) ?? [],
  };
}

function cloneDiagramPageConfig(config: DiagramPageConfig): DiagramPageConfig {
  return {
    ...config,
    viewport: config.viewport ? { ...config.viewport } : null,
    items: config.items.map(cloneDecorationNode),
    edges: config.edges.map(cloneDecorationEdge),
  };
}

function snapToReference(value: number, candidates: number[]) {
  let best = value;
  let bestDistance = SNAP_THRESHOLD + 1;

  candidates.forEach((candidate) => {
    const distance = Math.abs(candidate - value);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  });

  return bestDistance <= SNAP_THRESHOLD ? best : value;
}

function getNearestReference(value: number, candidates: number[]) {
  let best: number | undefined;
  let bestDistance = SNAP_THRESHOLD + 1;

  candidates.forEach((candidate) => {
    const distance = Math.abs(candidate - value);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  });

  return bestDistance <= SNAP_THRESHOLD ? best : undefined;
}

function applySmartSnap(position: { x: number; y: number }, moved: DiagramLayoutItem, layouts: DiagramLayoutItem[]) {
  const movedDefinition = getSchemeWidgetDefinition(moved.widgetType);
  const otherWidgets = layouts.filter((item) => item.id !== moved.id && item.page === moved.page && item.edge_id === moved.edge_id);

  const snappedX = snapToReference(
    position.x,
    otherWidgets.flatMap((item) => {
      const definition = getSchemeWidgetDefinition(item.widgetType);
      return [
        item.position.x,
        item.position.x + (definition.width / 2) - (movedDefinition.width / 2),
        item.position.x + definition.width - movedDefinition.width,
      ];
    })
  );

  const snappedY = snapToReference(
    position.y,
    otherWidgets.flatMap((item) => {
      const definition = getSchemeWidgetDefinition(item.widgetType);
      return [
        item.position.y,
        item.position.y + (definition.height / 2) - (movedDefinition.height / 2),
        item.position.y + definition.height - movedDefinition.height,
      ];
    })
  );

  return { x: snappedX, y: snappedY };
}

function getSmartSnapGuides(position: { x: number; y: number }, moved: DiagramLayoutItem, layouts: DiagramLayoutItem[]): SmartSnapGuides {
  const movedDefinition = getSchemeWidgetDefinition(moved.widgetType);
  const otherWidgets = layouts.filter((item) => item.id !== moved.id && item.page === moved.page && item.edge_id === moved.edge_id);

  const xReference = getNearestReference(
    position.x,
    otherWidgets.flatMap((item) => {
      const definition = getSchemeWidgetDefinition(item.widgetType);
      return [
        item.position.x,
        item.position.x + (definition.width / 2) - (movedDefinition.width / 2),
        item.position.x + definition.width - movedDefinition.width,
      ];
    })
  );

  const yReference = getNearestReference(
    position.y,
    otherWidgets.flatMap((item) => {
      const definition = getSchemeWidgetDefinition(item.widgetType);
      return [
        item.position.y,
        item.position.y + (definition.height / 2) - (movedDefinition.height / 2),
        item.position.y + definition.height - movedDefinition.height,
      ];
    })
  );

  return {
    x: xReference,
    y: yReference,
  };
}

const ZOOM_OPTIONS = [
  { label: '35%', value: 0.35 },
  { label: '55%', value: 0.55 },
  { label: '65%', value: 0.65 },
  { label: '70%', value: 0.7 },
  { label: '85%', value: 0.85 },
  { label: '100%', value: 1 },
];

const REFERENCE_SCHEME_WIDGET_TYPES = new Set<SchemeWidgetType>();

const REFERENCE_DECORATION_TYPES = new Set<DiagramDecorationNodeType>([
  'textLabel',
  'regionFrame',
  'busbarDecoration',
  'powerCabinet',
  'driveCabinet',
  'powerModuleUnit',
  'frequencyConverterUnit',
  'slimModuleUnit',
  'ringSwitchUnit',
  'motorUnit',
  'threePhaseTransformer',
]);

const getAvailablePages = (selectedEdge: string, edgePath: Edge[]): Array<{ label: string; value: string }> => {
  if (!selectedEdge) {
    return [];
  }

  const pages: Array<{ label: string; value: string }> = [];

  if (edgePath.length > 0) {
    const rootEdge = edgePath[0];
    pages.push({
      label: `Главная страница (${rootEdge.name})`,
      value: `MAIN_${rootEdge.id}`,
    });
  }

  pages.push({
    label: `Страница оборудования (${edgePath[edgePath.length - 1]?.name || selectedEdge})`,
    value: selectedEdge,
  });

  if (edgePath.length > 0) {
    const rootEdge = edgePath[0];
    pages.push(
      { label: `Состояние байпасов (${rootEdge.name})`, value: `BYPASS_${rootEdge.id}` },
      { label: `Аварии приводов (${rootEdge.name})`, value: `ACCIDENT_${rootEdge.id}` }
    );
  }

  edgePath.forEach((edge, index) => {
    if (index < edgePath.length - 1) {
      pages.push({
        label: `Родительская: ${edge.name}`,
        value: edge.id,
      });
    }
  });

  return pages;
};

function isWidgetLayoutItem(item: DiagramLayoutItem | DiagramDecorationNode): item is DiagramLayoutItem {
  return 'widgetType' in item;
}

function getNodeCenter(item: DiagramLayoutItem | DiagramDecorationNode) {
  return isWidgetLayoutItem(item)
    ? getFlowNodeCenterFromWidget(item.position, item.widgetType)
    : getFlowNodeCenterFromDecoration(item);
}

function getWidgetCenter(item: DiagramLayoutItem) {
  return getNodeCenter(item);
}

function getItemPositionFromFlowNodeCenter(center: { x: number; y: number }, item: DiagramLayoutItem | DiagramDecorationNode) {
  return isWidgetLayoutItem(item)
    ? getWidgetPositionFromFlowNodeCenter(center, item.widgetType)
    : getDecorationPositionFromFlowNodeCenter(center, item);
}

function clampNodeCenterPosition(center: { x: number; y: number }, item: DiagramLayoutItem | DiagramDecorationNode) {
  return isWidgetLayoutItem(item)
    ? clampFlowNodeCenterPosition(center, item.widgetType)
    : clampDecorationFlowNodeCenterPosition(center, item);
}

type AnchorSide = DiagramNodeAnchorSide;

function getHandleId(side: AnchorSide, type: 'source' | 'target') {
  return `${type}-${side}`;
}

function getConnectionSide(source: DiagramLayoutItem | DiagramDecorationNode, target: DiagramLayoutItem | DiagramDecorationNode): AnchorSide {
  const sourceCenter = getNodeCenter(source);
  const targetCenter = getNodeCenter(target);
  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? 'right' : 'left';
  }

  return dy >= 0 ? 'bottom' : 'top';
}

function getEdgeColor(kind: DiagramConnectionKind | DiagramDecorationEdgeKind) {
  switch (kind) {
    case 'power':
      return 'rgba(232, 201, 160, 0.82)';
    case 'alert':
      return 'rgba(255, 122, 122, 0.9)';
    case 'wire':
      return 'rgba(98, 108, 121, 0.82)';
    case 'signal':
    default:
      return 'rgba(123, 211, 255, 0.82)';
  }
}

function getEdgeStrokeWidth(kind: DiagramConnectionKind | DiagramDecorationEdgeKind) {
  switch (kind) {
    case 'power':
      return 3.5;
    case 'alert':
      return 3;
    case 'wire':
      return 2.4;
    case 'signal':
    default:
      return 2.5;
  }
}

function getWidgetDisplayLabel(item: DiagramLayoutItem, tagNames: Map<string, string>) {
  return item.customLabel || tagNames.get(item.tag_id) || item.tag_id;
}

function getDecorationDisplayTitle(item: DiagramDecorationNode) {
  const label = getDiagramDecorationDefinition(item.type).label;

  if (item.type === 'textLabel') {
    return item.data?.text || item.data?.title || label;
  }

  return item.data?.title || item.data?.text || label;
}

function getDecorationDisplaySubtitle(item: DiagramDecorationNode) {
  if (item.type === 'textLabel') {
    return item.data?.subtitle || '';
  }

  return item.data?.subtitle || item.data?.helperText || '';
}

function getPageEdgeDisplayLabel(
  edge: DiagramDecorationEdge,
  widgets: DiagramLayoutItem[],
  decorations: DiagramDecorationNode[],
  tagNames: Map<string, string>
) {
  const nodeMap = new Map<string, string>();

  widgets.forEach((item) => {
    nodeMap.set(item.id, getWidgetDisplayLabel(item, tagNames));
  });

  decorations.forEach((item) => {
    nodeMap.set(item.id, getDecorationDisplayTitle(item));
  });

  const source = nodeMap.get(edge.source) || edge.source;
  const target = nodeMap.get(edge.target) || edge.target;

  return edge.label || `${source} -> ${target}`;
}

function getWidgetAnchor(item: DiagramLayoutItem, target: DiagramLayoutItem) {
  const frame = getAdminPreviewDimensions(item.widgetType);
  const sourceCenter = getWidgetCenter(item);
  const targetCenter = getWidgetCenter(target);
  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return {
      x: dx >= 0 ? sourceCenter.x + frame.width / 2 : sourceCenter.x - frame.width / 2,
      y: sourceCenter.y,
      side: (dx >= 0 ? 'right' : 'left') as AnchorSide,
    };
  }

  return {
    x: sourceCenter.x,
    y: dy >= 0 ? sourceCenter.y + frame.height / 2 : sourceCenter.y - frame.height / 2,
    side: (dy >= 0 ? 'bottom' : 'top') as AnchorSide,
  };
}

function getAnchorLead(anchor: { x: number; y: number; side: AnchorSide }, offset = 24) {
  switch (anchor.side) {
    case 'left':
      return { x: anchor.x - offset, y: anchor.y };
    case 'right':
      return { x: anchor.x + offset, y: anchor.y };
    case 'top':
      return { x: anchor.x, y: anchor.y - offset };
    case 'bottom':
      return { x: anchor.x, y: anchor.y + offset };
    default:
      return { x: anchor.x, y: anchor.y };
  }
}

function getOrthogonalLinkPath(
  source: { x: number; y: number; side: AnchorSide },
  target: { x: number; y: number; side: AnchorSide }
) {
  const sourceLead = getAnchorLead(source);
  const targetLead = getAnchorLead(target);

  if ((source.side === 'left' || source.side === 'right') && (target.side === 'left' || target.side === 'right')) {
    const midX = sourceLead.x + ((targetLead.x - sourceLead.x) / 2);
    return [
      `M ${source.x} ${source.y}`,
      `L ${sourceLead.x} ${sourceLead.y}`,
      `L ${midX} ${sourceLead.y}`,
      `L ${midX} ${targetLead.y}`,
      `L ${targetLead.x} ${targetLead.y}`,
      `L ${target.x} ${target.y}`,
    ].join(' ');
  }

  if ((source.side === 'top' || source.side === 'bottom') && (target.side === 'top' || target.side === 'bottom')) {
    const midY = sourceLead.y + ((targetLead.y - sourceLead.y) / 2);
    return [
      `M ${source.x} ${source.y}`,
      `L ${sourceLead.x} ${sourceLead.y}`,
      `L ${sourceLead.x} ${midY}`,
      `L ${targetLead.x} ${midY}`,
      `L ${targetLead.x} ${targetLead.y}`,
      `L ${target.x} ${target.y}`,
    ].join(' ');
  }

  return [
    `M ${source.x} ${source.y}`,
    `L ${sourceLead.x} ${sourceLead.y}`,
    `L ${sourceLead.x} ${targetLead.y}`,
    `L ${targetLead.x} ${targetLead.y}`,
    `L ${target.x} ${target.y}`,
  ].join(' ');
}

const DiagramFlowNode: React.FC<FlowNodeProps<FlowNode<DiagramFlowNodeData>>> = ({ data, selected, dragging }) => {
  const handleContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    data.onOpenContextMenu({ id: data.item.id, x: event.clientX, y: event.clientY });
  };

  if (data.kind === 'widget') {
    const label = data.item.customLabel || data.tagName;
    const dimensions = getAdminPreviewDimensions(data.item.widgetType);

    return (
      <div
        className={`diagram-admin-canvas-widget diagram-admin-canvas-widget--layout-like-view ${dragging ? 'is-dragging' : ''} ${data.hasAlarm ? 'is-alarm' : ''} ${selected ? 'is-selected' : ''}`}
        title={`${label} · ${definition.label}`}
        onContextMenu={handleContextMenu}
      >
        <Handle id={getHandleId('left', 'source')} type="source" position={Position.Left} isConnectable={false} className="diagram-admin-flow-node__handle" />
        <Handle id={getHandleId('right', 'source')} type="source" position={Position.Right} isConnectable={false} className="diagram-admin-flow-node__handle" />
        <Handle id={getHandleId('top', 'source')} type="source" position={Position.Top} isConnectable={false} className="diagram-admin-flow-node__handle" />
        <Handle id={getHandleId('bottom', 'source')} type="source" position={Position.Bottom} isConnectable={false} className="diagram-admin-flow-node__handle" />
        <Handle id={getHandleId('left', 'target')} type="target" position={Position.Left} isConnectable={false} className="diagram-admin-flow-node__handle" />
        <Handle id={getHandleId('right', 'target')} type="target" position={Position.Right} isConnectable={false} className="diagram-admin-flow-node__handle" />
        <Handle id={getHandleId('top', 'target')} type="target" position={Position.Top} isConnectable={false} className="diagram-admin-flow-node__handle" />
        <Handle id={getHandleId('bottom', 'target')} type="target" position={Position.Bottom} isConnectable={false} className="diagram-admin-flow-node__handle" />

        <div className="diagram-admin-canvas-widget__symbol diagram-admin-canvas-widget__symbol--fill">
          <SchemeWidgetPreview type={data.item.widgetType} active={!data.hasAlarm} alarm={data.hasAlarm} />
        </div>
        <div className="diagram-admin-canvas-widget__meta diagram-admin-canvas-widget__meta--in-node">
          <strong>{label}</strong>
          <span>{definition.label}</span>
        </div>
      </div>
    );
  }

  const dimensions = getDecorationCanvasDimensions(data.item);

  return (
    <div
      className={`diagram-admin-canvas-widget diagram-admin-canvas-widget--decoration ${dragging ? 'is-dragging' : ''}`}
      title={data.title}
      style={{ width: dimensions.width, height: dimensions.height }}
      onContextMenu={handleContextMenu}
    >
      <Handle id={getHandleId('left', 'source')} type="source" position={Position.Left} isConnectable={false} className="diagram-admin-flow-node__handle" />
      <Handle id={getHandleId('right', 'source')} type="source" position={Position.Right} isConnectable={false} className="diagram-admin-flow-node__handle" />
      <Handle id={getHandleId('top', 'source')} type="source" position={Position.Top} isConnectable={false} className="diagram-admin-flow-node__handle" />
      <Handle id={getHandleId('bottom', 'source')} type="source" position={Position.Bottom} isConnectable={false} className="diagram-admin-flow-node__handle" />
      <Handle id={getHandleId('left', 'target')} type="target" position={Position.Left} isConnectable={false} className="diagram-admin-flow-node__handle" />
      <Handle id={getHandleId('right', 'target')} type="target" position={Position.Right} isConnectable={false} className="diagram-admin-flow-node__handle" />
      <Handle id={getHandleId('top', 'target')} type="target" position={Position.Top} isConnectable={false} className="diagram-admin-flow-node__handle" />
      <Handle id={getHandleId('bottom', 'target')} type="target" position={Position.Bottom} isConnectable={false} className="diagram-admin-flow-node__handle" />

      <div className="diagram-admin-canvas-widget__decoration">
        <DiagramDecorationPreview item={data.item} widthOverride={dimensions.width} heightOverride={dimensions.height} />
      </div>
    </div>
  );
};

const FLOW_NODE_TYPES = {
  diagramWidget: DiagramFlowNode,
};

function getAnchorSideFromPosition(position: Position): AnchorSide {
  switch (position) {
    case Position.Left:
      return 'left';
    case Position.Right:
      return 'right';
    case Position.Top:
      return 'top';
    case Position.Bottom:
    default:
      return 'bottom';
  }
}

function getPathFromWaypoints(source: DiagramPoint, target: DiagramPoint, waypoints: DiagramPoint[]) {
  return [
    `M ${source.x} ${source.y}`,
    ...waypoints.map((point) => `L ${point.x} ${point.y}`),
    `L ${target.x} ${target.y}`,
  ].join(' ');
}

const DiagramFlowEdge: React.FC<FlowEdgeProps<FlowEdge<DiagramFlowEdgeData>>> = ({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  data,
}) => {
  const path = data?.waypoints?.length
    ? getPathFromWaypoints({ x: sourceX, y: sourceY }, { x: targetX, y: targetY }, data.waypoints)
    : getOrthogonalLinkPath(
        {
          x: sourceX,
          y: sourceY,
          side: getAnchorSideFromPosition(sourcePosition),
        },
        {
          x: targetX,
          y: targetY,
          side: getAnchorSideFromPosition(targetPosition),
        }
      );

  return (
    <BaseEdge
      path={path}
      markerEnd={markerEnd}
      style={{
        ...style,
        stroke: getEdgeColor(data?.kind ?? 'signal'),
        strokeWidth: getEdgeStrokeWidth(data?.kind ?? 'signal'),
      }}
    />
  );
};

const FLOW_EDGE_TYPES = {
  diagram: DiagramFlowEdge,
};

const DiagramCanvas: React.FC<{
  selectedPage: string;
  selectedPageName: string;
  widgets: DiagramLayoutItem[];
  decorations: DiagramDecorationNode[];
  pageEdges: DiagramDecorationEdge[];
  fitRequestKey: number;
  selectedWidgetIds: string[];
  tagNames: Map<string, string>;
  zoom: number;
  onZoomChange?: (zoom: number) => void;
  onSelectionChange: (ids: string[], append: boolean) => void;
  onMoveNodes: (items: Array<{ id: string; position: { x: number; y: number } }>) => void;
  onEditWidget: (item: DiagramLayoutItem) => void;
  onEditDecoration: (item: DiagramDecorationNode) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}> = ({
  selectedPage,
  selectedPageName,
  widgets,
  decorations,
  pageEdges,
  fitRequestKey,
  selectedWidgetIds,
  tagNames,
  zoom,
  onZoomChange,
  onSelectionChange,
  onMoveNodes,
  onEditWidget,
  onEditDecoration,
  onDuplicate,
  onDelete,
}) => {
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<FlowNode<DiagramFlowNodeData>, FlowEdge<DiagramFlowEdgeData>> | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const dragSessionRef = useRef<{
    primaryId: string;
    originals: Map<string, { x: number; y: number }>;
    frame: number | null;
    centerOffset: { x: number; y: number };
  } | null>(null);
  const [dragIndicator, setDragIndicator] = useState<{ x: number; y: number } | null>(null);
  const [alignmentGuides, setAlignmentGuides] = useState<DiagramCanvasGuides | null>(null);
  const [contextMenuState, setContextMenuState] = useState<{ id: string; x: number; y: number } | null>(null);

  const handleOpenContextMenu = useCallback((payload: { id: string; x: number; y: number }) => {
    const surface = surfaceRef.current;
    if (!surface) {
      return;
    }

    const bounds = surface.getBoundingClientRect();
    setContextMenuState({
      id: payload.id,
      x: Math.max(12, payload.x - bounds.left),
      y: Math.max(12, payload.y - bounds.top),
    });
    onSelectionChange([payload.id], false);
  }, [onSelectionChange]);

  const itemMap = useMemo(() => {
    const map = new Map<string, DiagramLayoutItem | DiagramDecorationNode>();
    widgets.forEach((item) => map.set(item.id, item));
    decorations.forEach((item) => map.set(item.id, item));
    return map;
  }, [decorations, widgets]);

  const nodesFromProps = useMemo<FlowNode<DiagramFlowNodeData>[]>(() => ([
    ...widgets.map((item) => ({
      id: item.id,
      type: 'diagramWidget',
      className: 'diagram-admin-flow__node diagram-admin-flow__node--widget',
      position: getFlowNodeCenterFromWidget(item.position, item.widgetType),
      style: {
        ...getAdminPreviewDimensions(item.widgetType),
        zIndex: getWidgetFlowLayerZIndex(item),
      },
      data: {
        kind: 'widget' as const,
        item,
        tagName: tagNames.get(item.tag_id) || item.tag_id,
        hasAlarm: Boolean(item.connections?.some((connection) => connection.kind === 'alert')),
        onEditWidget,
        onDeleteNode: onDelete,
        onDuplicateNode: onDuplicate,
        onOpenContextMenu: handleOpenContextMenu,
      },
      selected: selectedWidgetIds.includes(item.id),
      draggable: true,
      selectable: true,
    })),
    ...decorations.map((item) => {
      const dimensions = getDecorationCanvasDimensions(item);

      return {
        id: item.id,
        type: 'diagramWidget',
        className: 'diagram-admin-flow__node diagram-admin-flow__node--decoration',
        position: getFlowNodeCenterFromDecoration(item),
        origin: [0.5, 0.5] as [number, number],
        style: {
          width: dimensions.width,
          height: dimensions.height,
          zIndex: getDecorationLayerZIndex(item),
        },
        data: {
          kind: 'decoration' as const,
          item,
          title: getDecorationDisplayTitle(item),
          subtitle: getDecorationDisplaySubtitle(item),
          onEditDecoration,
          onDeleteNode: onDelete,
          onDuplicateNode: onDuplicate,
          onOpenContextMenu: handleOpenContextMenu,
        },
        selected: selectedWidgetIds.includes(item.id),
        draggable: true,
        selectable: true,
      };
    }),
  ]), [decorations, handleOpenContextMenu, onDelete, onDuplicate, onEditDecoration, onEditWidget, selectedWidgetIds, tagNames, widgets]);
  const [draftNodes, setDraftNodes] = useState<FlowNode<DiagramFlowNodeData>[]>(nodesFromProps);
  const draftNodesRef = useRef<FlowNode<DiagramFlowNodeData>[]>(nodesFromProps);

  const widgetMap = useMemo(() => new Map(widgets.map((widget) => [widget.tag_id, widget])), [widgets]);

  const edges = useMemo<FlowEdge<DiagramFlowEdgeData>[]>(() => {
    const widgetEdges = widgets.flatMap((widget) =>
      (widget.connections ?? [])
        .map((connection) => {
          const target = widgetMap.get(connection.targetTagId);
          if (!target) {
            return null;
          }

          const sourceSide = getConnectionSide(widget, target);
          const targetSide = getConnectionSide(target, widget);

          return {
            id: `${widget.id}-${connection.targetTagId}-${connection.kind}`,
            source: widget.id,
            target: target.id,
            sourceHandle: getHandleId(sourceSide, 'source'),
            targetHandle: getHandleId(targetSide, 'target'),
            type: 'diagram',
            selectable: false,
            focusable: false,
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 16,
              height: 16,
              color: getEdgeColor(connection.kind),
            },
            data: {
              kind: connection.kind,
              decoration: false,
            },
            style: {
              strokeWidth: getEdgeStrokeWidth(connection.kind),
            },
          };
        })
        .filter((item): item is FlowEdge<DiagramFlowEdgeData> => item !== null)
    );

    const decorationEdges = pageEdges
      .map((edge) => {
        const source = itemMap.get(edge.source);
        const target = itemMap.get(edge.target);
        if (!source || !target) {
          return null;
        }

        const sourceSide = edge.sourceSide || getConnectionSide(source, target);
        const targetSide = edge.targetSide || getConnectionSide(target, source);

        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: getHandleId(sourceSide, 'source'),
          targetHandle: getHandleId(targetSide, 'target'),
          type: 'diagram',
          selectable: false,
          focusable: false,
          markerEnd: edge.kind === 'wire'
            ? undefined
            : {
                type: MarkerType.ArrowClosed,
                width: 14,
                height: 14,
                color: getEdgeColor(edge.kind),
              },
          data: {
            kind: edge.kind,
            decoration: true,
            waypoints: edge.waypoints?.map(getScaledCanvasPosition),
          },
          style: {
            strokeWidth: getEdgeStrokeWidth(edge.kind),
          },
        };
      })
      .filter((item): item is FlowEdge<DiagramFlowEdgeData> => item !== null);

    return [...widgetEdges, ...decorationEdges];
  }, [itemMap, pageEdges, widgetMap, widgets]);

  useEffect(() => {
    if (!flowInstance) {
      return;
    }

    const currentZoom = flowInstance.getZoom();
    if (Math.abs(currentZoom - zoom) < 0.01) {
      return;
    }

    flowInstance.zoomTo(zoom, { duration: 120 });
  }, [flowInstance, zoom]);

  useEffect(() => {
    if (dragSessionRef.current) {
      return;
    }

    setDraftNodes(nodesFromProps);
  }, [nodesFromProps]);

  useEffect(() => {
    draftNodesRef.current = draftNodes;
  }, [draftNodes]);

  /** Как во view: после появления узлов на полотне (первая отрисовка или загрузка с пустого), fit по содержимому. */
  const prevNodesCountRef = useRef<number | null>(null);
  useEffect(() => {
    const count = nodesFromProps.length;
    if (!flowInstance) {
      return;
    }

    if (count === 0) {
      prevNodesCountRef.current = 0;
      return;
    }

    const prev = prevNodesCountRef.current;
    const shouldFitAfterAppear = prev === null || prev === 0;
    if (!shouldFitAfterAppear) {
      prevNodesCountRef.current = count;
      return;
    }

    const frame = requestAnimationFrame(() => {
      flowInstance.fitView({
        padding: 0.12,
        minZoom: 0.35,
        maxZoom: 1.2,
        duration: 0,
        nodes: draftNodesRef.current.map((node) => ({ id: node.id })),
      });

      onZoomChange?.(clampZoomValue(flowInstance.getViewport().zoom));
    });

    prevNodesCountRef.current = count;

    return () => cancelAnimationFrame(frame);
  }, [flowInstance, nodesFromProps.length, onZoomChange]);

  useEffect(() => {
    if (!flowInstance || !draftNodesRef.current.length) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      flowInstance.fitView({
        padding: 0.12,
        minZoom: 0.35,
        maxZoom: 1.2,
        duration: 0,
        nodes: draftNodesRef.current.map((node) => ({ id: node.id })),
      });

      onZoomChange?.(clampZoomValue(flowInstance.getViewport().zoom));
    });

    return () => cancelAnimationFrame(frame);
  }, [fitRequestKey, flowInstance, onZoomChange]);

  const handleSelectionChange = useCallback<OnSelectionChangeFunc<FlowNode<DiagramFlowNodeData>, FlowEdge<DiagramFlowEdgeData>>>(({ nodes: selectedNodes }) => {
    onSelectionChange(selectedNodes.map((node) => node.id), false);
  }, [onSelectionChange]);

  const applyDragPointerPosition = useCallback((
    clientX: number,
    clientY: number,
    primaryId: string
  ) => {
    if (!flowInstance || !dragSessionRef.current) {
      return null;
    }

    const primaryItem = itemMap.get(primaryId);
    const gridStep = DEFAULT_GRID_STEP;
    const primaryOriginal = dragSessionRef.current.originals.get(primaryId);
    if (!primaryItem || !primaryOriginal) {
      return null;
    }

    const pointer = clampNodeCenterPosition(flowInstance.screenToFlowPosition({ x: clientX, y: clientY }), primaryItem);
    const centerOffset = dragSessionRef.current.centerOffset;

    let snappedCenter = {
      x: Math.round((pointer.x - centerOffset.x) / gridStep) * gridStep,
      y: Math.round((pointer.y - centerOffset.y) / gridStep) * gridStep,
    };

    const movingIds = new Set(dragSessionRef.current.originals.keys());
    const otherCenters = draftNodesRef.current
      .filter((node) => !movingIds.has(node.id))
      .map((node) => node.position);

    let guideX: number | undefined;
    let guideY: number | undefined;
    const threshold = 10;

    otherCenters.forEach((candidate) => {
      const xDistance = Math.abs(candidate.x - snappedCenter.x);
      const yDistance = Math.abs(candidate.y - snappedCenter.y);

      if (xDistance <= threshold && (guideX === undefined || xDistance < Math.abs(guideX - snappedCenter.x))) {
        snappedCenter.x = candidate.x;
        guideX = candidate.x;
      }

      if (yDistance <= threshold && (guideY === undefined || yDistance < Math.abs(guideY - snappedCenter.y))) {
        snappedCenter.y = candidate.y;
        guideY = candidate.y;
      }
    });

    const deltaX = snappedCenter.x - primaryOriginal.x;
    const deltaY = snappedCenter.y - primaryOriginal.y;
    const moved = new Map<string, { x: number; y: number }>();

    dragSessionRef.current.originals.forEach((original, id) => {
      const item = itemMap.get(id);
      if (!item) {
        return;
      }

      moved.set(id, clampNodeCenterPosition({
        x: original.x + deltaX,
        y: original.y + deltaY,
      }, item));
    });

    const viewport = flowInstance.getViewport();
    setDragIndicator({
      x: (snappedCenter.x * viewport.zoom) + viewport.x,
      y: (snappedCenter.y * viewport.zoom) + viewport.y,
    });

    setAlignmentGuides(guideX !== undefined || guideY !== undefined ? { x: guideX, y: guideY } : null);

    return moved;
  }, [flowInstance, itemMap]);

  const syncDraftNodes = useCallback((moved: Map<string, { x: number; y: number }>) => {
    setDraftNodes((current) => current.map((node) => {
      const nextPosition = moved.get(node.id);
      return nextPosition ? { ...node, position: nextPosition } : node;
    }));
  }, []);

  /** Flow → экранный пиксель относительно `surfaceRef` (как рисует React Flow), не сырой clientX курсора. */
  const flowToSurfacePosition = useCallback((point: { x: number; y: number }) => {
    if (!flowInstance || !surfaceRef.current) {
      return null;
    }

    const screen = flowInstance.flowToScreenPosition({ x: point.x, y: point.y });
    const bounds = surfaceRef.current.getBoundingClientRect();

    return {
      x: Math.round(screen.x - bounds.left),
      y: Math.round(screen.y - bounds.top),
    };
  }, [flowInstance]);

  /** Центр узла в пикселях относительно `surfaceRef` (фактическая отрисовка DOM), для согласования drag с логическими координатами. */
  const getRenderedNodeSurfaceCenter = useCallback((nodeId: string): { x: number; y: number } | null => {
    const surface = surfaceRef.current;
    if (!surface) {
      return null;
    }

    const nodeEls = surface.querySelectorAll<HTMLElement>('.react-flow__node');
    const el = Array.from(nodeEls).find((candidate) => {
      return candidate.dataset.id === nodeId || candidate.getAttribute('data-id') === nodeId;
    });
    if (el) {
      const nodeRect = el.getBoundingClientRect();
      const surfaceRect = surface.getBoundingClientRect();
      return {
        x: Math.round(nodeRect.left + nodeRect.width / 2 - surfaceRect.left),
        y: Math.round(nodeRect.top + nodeRect.height / 2 - surfaceRect.top),
      };
    }

    if (!flowInstance) {
      return null;
    }

    const node = flowInstance.getNode(nodeId);
    if (!node) {
      return null;
    }

    return flowToSurfacePosition(node.position);
  }, [flowInstance, flowToSurfacePosition]);

  const getRenderedNodeCenterOffset = useCallback((nodeId: string, logicalCenter: { x: number; y: number }) => {
    if (!flowInstance) {
      return { x: 0, y: 0 };
    }

    const renderedCenter = getRenderedNodeSurfaceCenter(nodeId);
    const logicalSurfaceCenter = flowToSurfacePosition(logicalCenter);
    if (!renderedCenter || !logicalSurfaceCenter) {
      return { x: 0, y: 0 };
    }

    const zoom = flowInstance.getViewport().zoom || 1;
    return {
      x: (renderedCenter.x - logicalSurfaceCenter.x) / zoom,
      y: (renderedCenter.y - logicalSurfaceCenter.y) / zoom,
    };
  }, [flowInstance, flowToSurfacePosition, getRenderedNodeSurfaceCenter]);

  const updateDragIndicatorFromFlowCenter = useCallback((flowCenter: { x: number; y: number }) => {
    const pos = flowToSurfacePosition(flowCenter);
    if (pos) {
      setDragIndicator(pos);
    }
  }, [flowToSurfacePosition]);

  const handleNodeEdit = useCallback((node: FlowNode<DiagramFlowNodeData>) => {
    if (node.data.kind === 'widget') {
      onEditWidget(node.data.item);
      return;
    }

    onEditDecoration(node.data.item);
  }, [onEditDecoration, onEditWidget]);

  const contextMenuNode = useMemo(() => {
    if (!contextMenuState) {
      return null;
    }

    return draftNodes.find((node) => node.id === contextMenuState.id) ?? null;
  }, [contextMenuState, draftNodes]);

  useEffect(() => {
    const closeMenu = () => setContextMenuState(null);
    window.addEventListener('click', closeMenu);
    window.addEventListener('blur', closeMenu);

    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('blur', closeMenu);
    };
  }, []);

  return (
    <div className="diagram-admin-canvas" data-page={selectedPage}>
      <div className="diagram-admin-canvas__header">
        <div>
          <h3>{selectedPageName}</h3>
          <p>Виджеты остаются теговыми, а page-level схема хранит подписи, области, шины, шкафы и проводки для выбранной страницы.</p>
        </div>
        <div className="diagram-admin-canvas__badge">{selectedPage}</div>
      </div>
      <div ref={surfaceRef} className="diagram-admin-canvas__surface diagram-admin-canvas__surface--flow">
        {alignmentGuides?.x !== undefined ? (() => {
          const point = flowToSurfacePosition({ x: alignmentGuides.x, y: 0 });
          return point ? (
            <div
              className="diagram-admin-canvas__alignment-guide diagram-admin-canvas__alignment-guide--vertical"
              style={{ left: `${point.x}px` }}
            />
          ) : null;
        })() : null}
        {alignmentGuides?.y !== undefined ? (() => {
          const point = flowToSurfacePosition({ x: 0, y: alignmentGuides.y });
          return point ? (
            <div
              className="diagram-admin-canvas__alignment-guide diagram-admin-canvas__alignment-guide--horizontal"
              style={{ top: `${point.y}px` }}
            />
          ) : null;
        })() : null}
        {dragIndicator ? (
          <div
            className="diagram-admin-canvas__drag-indicator"
            style={{
              left: `${dragIndicator.x}px`,
              top: `${dragIndicator.y}px`,
            }}
          />
        ) : null}
        {contextMenuState && contextMenuNode ? (
          <div
            className="diagram-admin-canvas__context-menu"
            style={{
              left: `${contextMenuState.x}px`,
              top: `${contextMenuState.y}px`,
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="diagram-admin-canvas__context-action"
              onClick={() => {
                handleNodeEdit(contextMenuNode);
                setContextMenuState(null);
              }}
            >
              <i className="pi pi-pencil" />
              <span>Редактировать</span>
            </button>
            <button
              type="button"
              className="diagram-admin-canvas__context-action"
              onClick={() => {
                onDuplicate(contextMenuNode.id);
                setContextMenuState(null);
              }}
            >
              <i className="pi pi-copy" />
              <span>Дублировать</span>
            </button>
            <button
              type="button"
              className="diagram-admin-canvas__context-action is-danger"
              onClick={() => {
                onDelete(contextMenuNode.id);
                setContextMenuState(null);
              }}
            >
              <i className="pi pi-trash" />
              <span>Удалить</span>
            </button>
          </div>
        ) : null}
        <ReactFlow
          nodes={draftNodes}
          edges={edges}
          nodeTypes={FLOW_NODE_TYPES}
          edgeTypes={FLOW_EDGE_TYPES}
          onInit={setFlowInstance}
          onSelectionChange={handleSelectionChange}
          onNodeDoubleClick={(_, node) => handleNodeEdit(node)}
          onNodeDragStart={(event, node, draggedNodes) => {
            const dragGroup = draggedNodes.length ? draggedNodes : [node];
            const nodePositionMap = new Map(
              draftNodesRef.current.map((draftNode) => [
                draftNode.id,
                { x: draftNode.position.x, y: draftNode.position.y },
              ])
            );
            const originals = new Map(
              dragGroup.map((draggedNode) => [
                draggedNode.id,
                nodePositionMap.get(draggedNode.id) ?? { x: draggedNode.position.x, y: draggedNode.position.y },
              ])
            );

            dragSessionRef.current = {
              primaryId: node.id,
              originals,
              frame: null,
              centerOffset: getRenderedNodeCenterOffset(
                node.id,
                originals.get(node.id) ?? { x: node.position.x, y: node.position.y }
              ),
            };

            const moved = applyDragPointerPosition(event.clientX, event.clientY, node.id);
            if (moved) {
              const flowCenter = moved.get(node.id);
              if (flowCenter) {
                updateDragIndicatorFromFlowCenter(flowCenter);
              }
              syncDraftNodes(moved);
            }
          }}
          onNodeDrag={(event, node) => {
            const session = dragSessionRef.current;
            if (!session) {
              return;
            }

            const moved = applyDragPointerPosition(event.clientX, event.clientY, node.id);
            if (!moved) {
              return;
            }

            const flowCenter = moved.get(node.id);
            if (flowCenter) {
              updateDragIndicatorFromFlowCenter(flowCenter);
            }

            if (session.frame !== null) {
              cancelAnimationFrame(session.frame);
            }

            session.frame = requestAnimationFrame(() => {
              syncDraftNodes(moved);
              if (dragSessionRef.current) {
                dragSessionRef.current.frame = null;
              }
            });
          }}
          onNodeDragStop={(event, node, draggedNodes) => {
            const dragGroup = draggedNodes.length ? draggedNodes : [node];
            const nodePositionMap = new Map(
              draftNodesRef.current.map((draftNode) => [
                draftNode.id,
                { x: draftNode.position.x, y: draftNode.position.y },
              ])
            );
            const moved = applyDragPointerPosition(event.clientX, event.clientY, node.id) ?? new Map(
              dragGroup.map((draggedNode) => {
                const item = itemMap.get(draggedNode.id);
                const currentPosition = nodePositionMap.get(draggedNode.id) ?? draggedNode.position;

                return [
                  draggedNode.id,
                  item ? clampNodeCenterPosition(currentPosition, item) : currentPosition,
                ] as const;
              })
            );

            if (dragSessionRef.current?.frame !== null) {
              cancelAnimationFrame(dragSessionRef.current.frame);
            }

            syncDraftNodes(moved);
            onMoveNodes(
              dragGroup
                .map((draggedNode) => {
                  const item = itemMap.get(draggedNode.id);
                  if (!item) {
                    return null;
                  }

                  return {
                    id: draggedNode.id,
                    position: getItemPositionFromFlowNodeCenter(moved.get(draggedNode.id) ?? draggedNode.position, item),
                  };
                })
                .filter((item): item is { id: string; position: { x: number; y: number } } => item !== null)
            );
            dragSessionRef.current = null;
            setDragIndicator(null);
            setAlignmentGuides(null);
          }}
          onPaneClick={() => {
            onSelectionChange([], false);
            setAlignmentGuides(null);
            setContextMenuState(null);
          }}
          onPaneMouseLeave={() => {
            setDragIndicator(null);
            setAlignmentGuides(null);
          }}
          onMoveEnd={(_, viewport) => {
            if (viewport?.zoom !== undefined) {
              onZoomChange?.(clampZoomValue(viewport.zoom));
            }
          }}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          defaultViewport={{ x: 24, y: 24, zoom }}
          onlyRenderVisibleElements
          snapToGrid
          snapGrid={[DEFAULT_GRID_STEP, DEFAULT_GRID_STEP]}
          selectionOnDrag={false}
          selectionKeyCode="Shift"
          selectionMode={SelectionMode.Partial}
          selectNodesOnDrag={false}
          panOnDrag
          panActivationKeyCode="Space"
          zoomActivationKeyCode={['Meta', 'Control']}
          multiSelectionKeyCode={['Meta', 'Control']}
          zoomOnDoubleClick={false}
          fitView={false}
          nodesDraggable
          nodesConnectable={false}
          elementsSelectable
          elevateNodesOnSelect
          nodeOrigin={[0.5, 0.5]}
          translateExtent={[[-120, -120], [CANVAS_LIMITS.width * ADMIN_PREVIEW_SCALE + 120, CANVAS_UNBOUNDED_Y * ADMIN_PREVIEW_SCALE + 120]]}
          className="diagram-admin-flow"
          proOptions={{ hideAttribution: true }}
        >
          <Background
            id="diagram-grid"
            variant={BackgroundVariant.Lines}
            gap={8}
            size={1}
            color="rgba(255,255,255,0.06)"
          />
        </ReactFlow>
      </div>
    </div>
  );
};

const DiagramWidgetForm: React.FC<{
  item: DiagramLayoutItem | null;
  tags: Tag[];
  pages: Array<{ label: string; value: string }>;
  pageWidgets: DiagramLayoutItem[];
  tagNames: Map<string, string>;
  onSave: (item: DiagramLayoutItem) => void;
  onCancel: () => void;
}> = ({ item, tags, pages, pageWidgets, tagNames, onSave, onCancel }) => {
  const [formData, setFormData] = useState<DiagramLayoutItem | null>(item);
  const [error, setError] = useState('');
  const [connectionDraftTagId, setConnectionDraftTagId] = useState('');

  useEffect(() => {
    setFormData(item);
    setError('');
    setConnectionDraftTagId('');
  }, [item]);

  if (!formData) {
    return null;
  }

  const definition = getSchemeWidgetDefinition(formData.widgetType);
  const connectionCandidates = pageWidgets.filter((widget) => widget.id !== formData.id && widget.page === formData.page);
  const selectedConnections = (formData.connections ?? [])
    .map((connection) => {
      const widget = connectionCandidates.find((candidate) => candidate.tag_id === connection.targetTagId);
      return widget ? { connection, widget } : null;
    })
    .filter((item): item is { connection: DiagramConnection; widget: DiagramLayoutItem } => item !== null);
  const availableConnectionCandidates = connectionCandidates.filter(
    (widget) => !(formData.connections ?? []).some((item) => item.targetTagId === widget.tag_id)
  );

  const updatePosition = (axis: 'x' | 'y', value: string) => {
    const parsed = Number(value);
    const safeValue = Number.isFinite(parsed) ? parsed : GRID_OFFSET;
    const nextPosition = normalizeWidgetPosition(
      {
        ...formData.position,
        [axis]: safeValue,
      },
      formData.widgetType
    );

    setFormData({ ...formData, position: nextPosition });
  };

  const addConnection = (tagId: string) => {
    if (!tagId || (formData.connections ?? []).some((item) => item.targetTagId === tagId)) {
      return;
    }

    setFormData({
      ...formData,
      connections: [...(formData.connections ?? []), { targetTagId: tagId, kind: 'signal' }],
    });
    setConnectionDraftTagId('');
  };

  const removeConnection = (tagId: string) => {
    setFormData({
      ...formData,
      connections: (formData.connections ?? []).filter((item) => item.targetTagId !== tagId),
    });
  };

  const updateConnectionKind = (tagId: string, kind: DiagramConnectionKind) => {
    setFormData({
      ...formData,
      connections: (formData.connections ?? []).map((item) =>
        item.targetTagId === tagId ? { ...item, kind } : item
      ),
    });
  };

  const handleSave = () => {
    if (!formData.tag_id || !formData.page || !formData.widgetType) {
      setError('Заполните обязательные поля: тег, страница и тип элемента.');
      return;
    }

    onSave({
      ...formData,
      position: normalizeWidgetPosition(formData.position, formData.widgetType),
      displayType: 'widget',
      connections: (formData.connections ?? []).filter((item) => Boolean(item.targetTagId)),
    });
  };

  return (
    <div className="diagram-widget-form">
      {error ? <Message severity="error" text={error} className="mb-3" /> : null}

      <div className="diagram-widget-form__preview">
        <SchemeWidgetPreview type={formData.widgetType} active />
        <div>
          <strong>{definition.label}</strong>
          <p>{definition.description}</p>
        </div>
      </div>

      <div className="field mt-3">
        <label htmlFor="diagram-widget-tag" className="font-semibold mb-2 block">Тег</label>
        <Dropdown
          inputId="diagram-widget-tag"
          value={formData.tag_id}
          onChange={(event) => setFormData({ ...formData, tag_id: event.value })}
          options={tags.map((tag) => ({ label: `${tag.name} (${tag.id})`, value: tag.id }))}
          placeholder="Выберите тег"
          className="w-full"
          filter
          virtualScrollerOptions={{ itemSize: 36 }}
        />
      </div>

      <div className="field mt-3">
        <label htmlFor="diagram-widget-page" className="font-semibold mb-2 block">Страница размещения</label>
        <Dropdown
          inputId="diagram-widget-page"
          value={formData.page}
          onChange={(event) => setFormData({ ...formData, page: event.value, connections: [] })}
          options={pages}
          optionLabel="label"
          optionValue="value"
          className="w-full"
        />
      </div>

      <div className="field mt-3">
        <label htmlFor="diagram-widget-type" className="font-semibold mb-2 block">Тип элемента</label>
        <Dropdown
          inputId="diagram-widget-type"
          value={formData.widgetType}
          onChange={(event) => {
            const widgetType = event.value as SchemeWidgetType;
            setFormData({
              ...formData,
              widgetType,
              position: normalizeWidgetPosition(formData.position, widgetType),
            });
          }}
          options={SCHEME_WIDGET_LIBRARY.map((type) => ({ label: type.label, value: type.type }))}
          className="w-full"
        />
      </div>

      <div className="field mt-3">
        <label htmlFor="diagram-widget-label" className="font-semibold mb-2 block">Подпись</label>
        <InputText
          id="diagram-widget-label"
          value={formData.customLabel || ''}
          onChange={(event) => setFormData({ ...formData, customLabel: event.target.value })}
          placeholder="Например: Пускатель насоса"
        />
      </div>

      <div className="field mt-3">
        <label className="font-semibold mb-2 block">Связи с другими элементами страницы</label>
        <div className="diagram-widget-form__connection-help">
          <div className="diagram-widget-form__connection-help-item diagram-widget-form__connection-help-item--power">
            <strong>Силовая</strong>
            <span>Показывает линию питания или передачу мощности между узлами: двигатель, насос, привод, шкаф питания.</span>
          </div>
          <div className="diagram-widget-form__connection-help-item diagram-widget-form__connection-help-item--signal">
            <strong>Сигнальная</strong>
            <span>Показывает управляющий или информационный обмен: датчик, кнопка, контроллер, дискретный или аналоговый сигнал.</span>
          </div>
          <div className="diagram-widget-form__connection-help-item diagram-widget-form__connection-help-item--alert">
            <strong>Аварийная</strong>
            <span>Используется для аварийных связей и защит: блокировка, тревога, отказ, цепь аварийного останова.</span>
          </div>
        </div>
        {connectionCandidates.length ? (
          <>
            <div className="diagram-widget-form__connection-add">
              <Dropdown
                value={connectionDraftTagId}
                onChange={(event) => setConnectionDraftTagId(event.value)}
                options={availableConnectionCandidates.map((widget) => ({
                  label: `${widget.customLabel || tagNames.get(widget.tag_id) || widget.tag_id} · ${getSchemeWidgetDefinition(widget.widgetType).label}`,
                  value: widget.tag_id,
                }))}
                placeholder="Выберите элемент для связи"
                className="diagram-widget-form__connection-picker"
                filter
                virtualScrollerOptions={{ itemSize: 36 }}
              />
              <Button
                type="button"
                label="Добавить"
                icon="pi pi-plus"
                size="small"
                onClick={() => addConnection(connectionDraftTagId)}
                disabled={!connectionDraftTagId}
              />
            </div>

            {availableConnectionCandidates.length ? (
              <div className="diagram-widget-form__connection-quick">
                {availableConnectionCandidates.slice(0, 8).map((widget) => (
                  <button
                    key={widget.id}
                    type="button"
                    className="diagram-widget-form__connection-quick-item"
                    onClick={() => addConnection(widget.tag_id)}
                  >
                    <SchemeWidgetPreview type={widget.widgetType} active={false} />
                    <span>{widget.customLabel || tagNames.get(widget.tag_id) || widget.tag_id}</span>
                  </button>
                ))}
              </div>
            ) : null}

            {selectedConnections.length ? (
              <div className="diagram-widget-form__connections">
                {selectedConnections.map(({ connection, widget }) => (
                  <div key={widget.id} className="diagram-widget-form__connection-item">
                    <SchemeWidgetPreview type={widget.widgetType} active={false} />
                    <div className="diagram-widget-form__connection-meta">
                      <strong>{widget.customLabel || tagNames.get(widget.tag_id) || widget.tag_id}</strong>
                      <span>{getSchemeWidgetDefinition(widget.widgetType).label}</span>
                    </div>
                    <Dropdown
                      value={connection.kind}
                      onChange={(event) => updateConnectionKind(widget.tag_id, event.value)}
                      options={CONNECTION_KIND_OPTIONS}
                      optionLabel="label"
                      optionValue="value"
                      className="diagram-widget-form__connection-kind"
                    />
                    <Button
                      type="button"
                      icon="pi pi-times"
                      text
                      rounded
                      severity="secondary"
                      onClick={() => removeConnection(widget.tag_id)}
                      aria-label={`Удалить связь ${widget.customLabel || tagNames.get(widget.tag_id) || widget.tag_id}`}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="diagram-admin-muted">Связи пока не добавлены. Выберите элемент выше или воспользуйтесь быстрыми кнопками.</p>
            )}
          </>
        ) : (
          <p className="diagram-admin-muted">На этой странице пока нет других элементов для связи.</p>
        )}
      </div>

      <div className="field mt-3">
        <label htmlFor="diagram-widget-z-index" className="font-semibold mb-2 block">Слой (z-index)</label>
        <p className="diagram-admin-muted text-sm mb-2 m-0">
          Больше — выше остальных. По умолчанию виджеты отображаются поверх фоновых рамок областей (как во view).
        </p>
        <input
          id="diagram-widget-z-index"
          type="number"
          className="p-inputtext w-full"
          placeholder="0 — по умолчанию"
          value={formData.zIndex !== undefined && formData.zIndex !== null ? String(formData.zIndex) : ''}
          onChange={(event) => {
            const raw = event.target.value.trim();
            if (raw === '') {
              setFormData({ ...formData, zIndex: undefined });
              return;
            }
            const n = Number(raw);
            if (!Number.isFinite(n)) {
              return;
            }
            setFormData({ ...formData, zIndex: Math.round(n) });
          }}
        />
      </div>

      <div className="field mt-3">
        <label className="font-semibold mb-2 block">Позиция</label>
        <div className="diagram-widget-form__position">
          <span>X: {Math.round(formData.position.x)}</span>
          <span>Y: {Math.round(formData.position.y)}</span>
          <span>{definition.width}×{definition.height}</span>
        </div>
      </div>

      <div className="field mt-3">
        <label className="font-semibold mb-2 block">Точное позиционирование</label>
        <div className="diagram-widget-form__position-controls">
          <div className="diagram-widget-form__position">
            <label className="diagram-widget-form__position-field">
              <span>X</span>
              <input
                type="number"
                step="1"
                min={String(GRID_OFFSET)}
                max={String(CANVAS_LIMITS.width - definition.width - GRID_OFFSET)}
                value={Math.round(formData.position.x)}
                onChange={(event) => updatePosition('x', event.target.value)}
                className="p-inputtext"
              />
            </label>
            <label className="diagram-widget-form__position-field">
              <span>Y</span>
              <input
                type="number"
                step="1"
                min={String(GRID_OFFSET)}
                value={Math.round(formData.position.y)}
                onChange={(event) => updatePosition('y', event.target.value)}
                className="p-inputtext"
              />
            </label>
            <span className="diagram-widget-form__position-size">{definition.width}x{definition.height}</span>
          </div>
        </div>
      </div>

      <div className="form-actions mt-4">
        <Button label="Сохранить" icon="pi pi-check" onClick={handleSave} />
        <Button label="Отмена" icon="pi pi-times" severity="secondary" onClick={onCancel} />
      </div>
    </div>
  );
};

const ANCHOR_SIDE_OPTIONS: Array<{ value: DiagramNodeAnchorSide; label: string }> = [
  { value: 'top', label: 'Сверху' },
  { value: 'right', label: 'Справа' },
  { value: 'bottom', label: 'Снизу' },
  { value: 'left', label: 'Слева' },
];

function sanitizeDecorationDimension(value: string, fallback: number, min = 36, max = 900) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(min, Math.min(Math.round(parsed), max));
}

const DiagramDecorationForm: React.FC<{
  item: DiagramDecorationNode | null;
  tags: Tag[];
  onSave: (item: DiagramDecorationNode) => void;
  onCancel: () => void;
}> = ({ item, tags, onSave, onCancel }) => {
  const [formData, setFormData] = useState<DiagramDecorationNode | null>(item);
  const [error, setError] = useState('');

  useEffect(() => {
    setFormData(item);
    setError('');
  }, [item]);

  if (!formData) {
    return null;
  }

  const definition = getDiagramDecorationDefinition(formData.type);
  const sortedTagOptions = sortTagsByName(tags || []);

  const updatePosition = (axis: 'x' | 'y', value: string) => {
    const parsed = Number(value);
    const safeValue = Number.isFinite(parsed) ? parsed : GRID_OFFSET;

    setFormData((current) => current ? {
      ...current,
      position: normalizeDecorationPosition(
        {
          ...current.position,
          [axis]: safeValue,
        },
        current,
      ),
    } : current);
  };

  const updateSize = (axis: 'width' | 'height', value: string) => {
    setFormData((current) => current ? (() => {
      const nextValue = sanitizeDecorationDimension(value, current[axis], axis === 'width' ? 48 : 32);
      const resized = {
        ...current,
        [axis]: nextValue,
      };

      return {
        ...resized,
        position: normalizeDecorationPosition(resized.position, resized),
      };
    })() : current);
  };

  const updateDataField = (field: keyof NonNullable<DiagramDecorationNode['data']>, value: string) => {
    setFormData((current) => current ? {
      ...current,
      data: {
        ...(current.data ?? {}),
        [field]: value,
      },
    } : current);
  };

  const updateStyleField = (field: keyof NonNullable<DiagramDecorationNode['style']>, value: string | number | boolean) => {
    setFormData((current) => current ? {
      ...current,
      style: {
        ...(current.style ?? {}),
        [field]: value,
      },
    } : current);
  };

  const updateBindingField = (field: 'stateTagId' | 'alarmTagId', value: string) => {
    setFormData((current) => current ? {
      ...current,
      bindings: {
        ...(current.bindings ?? {}),
        [field]: value || undefined,
      },
    } : current);
  };

  const handleTypeChange = (nextType: DiagramDecorationNodeType) => {
    const base = createDefaultDiagramDecorationNode(nextType, formData.id, formData.position);
    const merged = {
      ...base,
      position: normalizeDecorationPosition(formData.position, base),
      bindings: formData.bindings ? { ...formData.bindings } : undefined,
    };

    setFormData(merged);
  };

  const handleSave = () => {
    if (!formData.type) {
      setError('Выберите тип page-level элемента.');
      return;
    }

    const normalized = {
      ...formData,
      position: normalizeDecorationPosition(formData.position, formData),
      width: sanitizeDecorationDimension(String(formData.width), formData.width, 48),
      height: sanitizeDecorationDimension(String(formData.height), formData.height, 32),
    };

    onSave(normalized);
  };

  return (
    <div className="diagram-widget-form">
      {error ? <Message severity="error" text={error} className="mb-3" /> : null}

      <div className="diagram-widget-form__preview">
        <DiagramDecorationPreview item={formData} widthOverride={96} heightOverride={96} />
        <div>
          <strong>{definition.label}</strong>
          <p>{definition.description}</p>
        </div>
      </div>

      <div className="field mt-3">
        <label htmlFor="diagram-decoration-type" className="font-semibold mb-2 block">Тип элемента</label>
        <Dropdown
          inputId="diagram-decoration-type"
          value={formData.type}
          onChange={(event) => handleTypeChange(event.value)}
          options={DIAGRAM_DECORATION_LIBRARY.map((itemOption) => ({ label: itemOption.label, value: itemOption.type }))}
          className="w-full"
        />
      </div>

      <div className="field mt-3">
        <label htmlFor="diagram-decoration-state-tag" className="font-semibold mb-2 block">Тег состояния</label>
        <Dropdown
          inputId="diagram-decoration-state-tag"
          value={formData.bindings?.stateTagId || ''}
          onChange={(event) => updateBindingField('stateTagId', event.value)}
          options={[
            { label: 'Не привязан', value: '' },
            ...sortedTagOptions.map((tag) => ({ label: `${tag.name} (${tag.id})`, value: tag.id })),
          ]}
          className="w-full"
          filter
          virtualScrollerOptions={{ itemSize: 36 }}
        />
      </div>

      <div className="field mt-3">
        <label htmlFor="diagram-decoration-alarm-tag" className="font-semibold mb-2 block">Аварийный тег</label>
        <Dropdown
          inputId="diagram-decoration-alarm-tag"
          value={formData.bindings?.alarmTagId || ''}
          onChange={(event) => updateBindingField('alarmTagId', event.value)}
          options={[
            { label: 'Не привязан', value: '' },
            ...sortedTagOptions.map((tag) => ({ label: `${tag.name} (${tag.id})`, value: tag.id })),
          ]}
          className="w-full"
          filter
          virtualScrollerOptions={{ itemSize: 36 }}
        />
      </div>

      {formData.type === 'textLabel' ? (
        <>
          <div className="field mt-3">
            <label htmlFor="diagram-decoration-text" className="font-semibold mb-2 block">Текст</label>
            <InputText
              id="diagram-decoration-text"
              value={formData.data?.text || ''}
              onChange={(event) => updateDataField('text', event.target.value)}
              placeholder="Например: КРУ1 - ЯЧ 3"
            />
          </div>
          <div className="field mt-3">
            <label htmlFor="diagram-decoration-subtitle" className="font-semibold mb-2 block">Подстрока</label>
            <InputText
              id="diagram-decoration-subtitle"
              value={formData.data?.subtitle || ''}
              onChange={(event) => updateDataField('subtitle', event.target.value)}
              placeholder="Например: Q2"
            />
          </div>
          <div className="field mt-3">
            <label htmlFor="diagram-decoration-align" className="font-semibold mb-2 block">Выравнивание</label>
            <Dropdown
              inputId="diagram-decoration-align"
              value={formData.data?.align || 'left'}
              onChange={(event) => updateDataField('align', event.value)}
              options={[
                { label: 'Left', value: 'left' },
                { label: 'Center', value: 'center' },
                { label: 'Right', value: 'right' },
              ]}
              className="w-full"
            />
          </div>
          <div className="field mt-3">
            <label htmlFor="diagram-decoration-font-size" className="font-semibold mb-2 block">Размер шрифта</label>
            <input
              id="diagram-decoration-font-size"
              type="number"
              min="12"
              max="48"
              value={formData.style?.fontSize ?? 22}
              onChange={(event) => updateStyleField('fontSize', sanitizeDecorationDimension(event.target.value, formData.style?.fontSize ?? 22, 12, 48))}
              className="p-inputtext w-full"
            />
          </div>
        </>
      ) : null}

      {formData.type === 'regionFrame' ? (
        <>
          <div className="field mt-3">
            <label htmlFor="diagram-decoration-title" className="font-semibold mb-2 block">Заголовок области</label>
            <InputText
              id="diagram-decoration-title"
              value={formData.data?.title || ''}
              onChange={(event) => updateDataField('title', event.target.value)}
            />
          </div>
          <div className="field mt-3">
            <label htmlFor="diagram-decoration-region-subtitle" className="font-semibold mb-2 block">Подзаголовок</label>
            <InputText
              id="diagram-decoration-region-subtitle"
              value={formData.data?.subtitle || ''}
              onChange={(event) => updateDataField('subtitle', event.target.value)}
            />
          </div>
        </>
      ) : null}

      {formData.type === 'busbarDecoration' ? (
        <>
          <div className="field mt-3">
            <label htmlFor="diagram-decoration-bus-title" className="font-semibold mb-2 block">Подпись шины</label>
            <InputText
              id="diagram-decoration-bus-title"
              value={formData.data?.title || ''}
              onChange={(event) => updateDataField('title', event.target.value)}
            />
          </div>
          <div className="field mt-3">
            <label htmlFor="diagram-decoration-orientation" className="font-semibold mb-2 block">Ориентация</label>
            <Dropdown
              inputId="diagram-decoration-orientation"
              value={formData.data?.orientation || 'horizontal'}
              onChange={(event) => updateDataField('orientation', event.value)}
              options={[
                { label: 'Horizontal', value: 'horizontal' },
                { label: 'Vertical', value: 'vertical' },
              ]}
              className="w-full"
            />
          </div>
        </>
      ) : null}

      {formData.type === 'switchgearCell' || formData.type === 'motorUnit' || formData.type === 'threePhaseTransformer' ? (
        <>
          <div className="field mt-3">
            <label htmlFor="diagram-decoration-title-generic" className="font-semibold mb-2 block">Основная подпись</label>
            <InputText
              id="diagram-decoration-title-generic"
              value={formData.data?.title || ''}
              onChange={(event) => updateDataField('title', event.target.value)}
            />
          </div>
          <div className="field mt-3">
            <label htmlFor="diagram-decoration-subtitle-generic" className="font-semibold mb-2 block">Вторая строка</label>
            <InputText
              id="diagram-decoration-subtitle-generic"
              value={formData.data?.subtitle || ''}
              onChange={(event) => updateDataField('subtitle', event.target.value)}
            />
          </div>
        </>
      ) : null}

      {formData.type === 'powerCabinet' ? (
        <>
          <div className="field mt-3">
            <label htmlFor="diagram-decoration-power-title" className="font-semibold mb-2 block">Заголовок шкафа</label>
            <InputText
              id="diagram-decoration-power-title"
              value={formData.data?.title || ''}
              onChange={(event) => updateDataField('title', event.target.value)}
            />
          </div>
          <div className="field mt-3">
            <label htmlFor="diagram-decoration-left-label" className="font-semibold mb-2 block">Левый модуль</label>
            <InputText
              id="diagram-decoration-left-label"
              value={formData.data?.leftLabel || ''}
              onChange={(event) => updateDataField('leftLabel', event.target.value)}
            />
          </div>
          <div className="field mt-3">
            <label htmlFor="diagram-decoration-right-label" className="font-semibold mb-2 block">Правый модуль</label>
            <InputText
              id="diagram-decoration-right-label"
              value={formData.data?.rightLabel || ''}
              onChange={(event) => updateDataField('rightLabel', event.target.value)}
            />
          </div>
          <div className="field mt-3">
            <label htmlFor="diagram-decoration-bottom-label" className="font-semibold mb-2 block">Нижняя подпись</label>
            <InputText
              id="diagram-decoration-bottom-label"
              value={formData.data?.bottomLabel || ''}
              onChange={(event) => updateDataField('bottomLabel', event.target.value)}
            />
          </div>
        </>
      ) : null}

      {formData.type === 'driveCabinet' ? (
        <>
          <div className="field mt-3">
            <label htmlFor="diagram-decoration-drive-helper" className="font-semibold mb-2 block">Верхняя подпись</label>
            <InputText
              id="diagram-decoration-drive-helper"
              value={formData.data?.helperText || ''}
              onChange={(event) => updateDataField('helperText', event.target.value)}
            />
          </div>
          <div className="field mt-3">
            <label htmlFor="diagram-decoration-drive-subtitle" className="font-semibold mb-2 block">Средняя подпись</label>
            <InputText
              id="diagram-decoration-drive-subtitle"
              value={formData.data?.subtitle || ''}
              onChange={(event) => updateDataField('subtitle', event.target.value)}
            />
          </div>
          <div className="field mt-3">
            <label htmlFor="diagram-decoration-drive-title" className="font-semibold mb-2 block">Название шкафа</label>
            <InputText
              id="diagram-decoration-drive-title"
              value={formData.data?.title || ''}
              onChange={(event) => updateDataField('title', event.target.value)}
            />
          </div>
        </>
      ) : null}

      <div className="field mt-3">
        <label className="font-semibold mb-2 block">Размер и позиция</label>
        <div className="diagram-widget-form__position-controls">
          <div className="diagram-widget-form__position">
            <label className="diagram-widget-form__position-field">
              <span>X</span>
              <input type="number" value={Math.round(formData.position.x)} onChange={(event) => updatePosition('x', event.target.value)} className="p-inputtext" />
            </label>
            <label className="diagram-widget-form__position-field">
              <span>Y</span>
              <input type="number" value={Math.round(formData.position.y)} onChange={(event) => updatePosition('y', event.target.value)} className="p-inputtext" />
            </label>
            <label className="diagram-widget-form__position-field">
              <span>Width</span>
              <input type="number" value={Math.round(formData.width)} onChange={(event) => updateSize('width', event.target.value)} className="p-inputtext" />
            </label>
            <label className="diagram-widget-form__position-field">
              <span>Height</span>
              <input type="number" value={Math.round(formData.height)} onChange={(event) => updateSize('height', event.target.value)} className="p-inputtext" />
            </label>
          </div>
        </div>
      </div>

      <div className="field mt-3">
        <label htmlFor="diagram-decoration-z-index" className="font-semibold mb-2 block">Слой (z-index)</label>
        <p className="diagram-admin-muted text-sm mb-2 m-0">
          Управляет перекрытием с виджетами и другими декорациями. Пусто или 0 — правило по умолчанию для типа (рамка области: ниже виджетов).
        </p>
        <input
          id="diagram-decoration-z-index"
          type="number"
          className="p-inputtext w-full"
          placeholder="По умолчанию для типа"
          value={typeof formData.zIndex === 'number' && formData.zIndex !== 0 ? String(formData.zIndex) : ''}
          onChange={(event) => {
            const raw = event.target.value.trim();
            if (raw === '') {
              setFormData({ ...formData, zIndex: 0 });
              return;
            }
            const n = Number(raw);
            if (!Number.isFinite(n)) {
              return;
            }
            setFormData({ ...formData, zIndex: Math.round(n) });
          }}
        />
      </div>

      <div className="form-actions mt-4">
        <Button label="Сохранить" icon="pi pi-check" onClick={handleSave} />
        <Button label="Отмена" icon="pi pi-times" severity="secondary" onClick={onCancel} />
      </div>
    </div>
  );
};

const DiagramPageEdgeForm: React.FC<{
  item: DiagramDecorationEdge | null;
  nodeOptions: Array<{ value: string; label: string }>;
  onSave: (item: DiagramDecorationEdge) => void;
  onDelete?: (id: string) => void;
  canDelete?: boolean;
  onCancel: () => void;
}> = ({ item, nodeOptions, onSave, onDelete, canDelete = false, onCancel }) => {
  const [formData, setFormData] = useState<DiagramDecorationEdge | null>(item);
  const [error, setError] = useState('');

  useEffect(() => {
    setFormData(item);
    setError('');
  }, [item]);

  if (!formData) {
    return null;
  }

  const handleSave = () => {
    if (!formData.source || !formData.target) {
      setError('Выберите источник и целевой элемент.');
      return;
    }

    if (formData.source === formData.target) {
      setError('Проводка должна соединять разные элементы.');
      return;
    }

    onSave({
      ...formData,
      label: formData.label?.trim() || undefined,
    });
  };

  return (
    <div className="diagram-widget-form">
      {error ? <Message severity="error" text={error} className="mb-3" /> : null}

      <div className="field mt-3">
        <label htmlFor="diagram-edge-source" className="font-semibold mb-2 block">Откуда</label>
        <Dropdown
          inputId="diagram-edge-source"
          value={formData.source}
          onChange={(event) => setFormData({ ...formData, source: event.value })}
          options={[{ label: 'Выберите элемент', value: '' }, ...nodeOptions]}
          optionLabel="label"
          optionValue="value"
          className="w-full"
          filter
          virtualScrollerOptions={{ itemSize: 36 }}
        />
      </div>

      <div className="field mt-3">
        <label htmlFor="diagram-edge-target" className="font-semibold mb-2 block">Куда</label>
        <Dropdown
          inputId="diagram-edge-target"
          value={formData.target}
          onChange={(event) => setFormData({ ...formData, target: event.value })}
          options={[{ label: 'Выберите элемент', value: '' }, ...nodeOptions]}
          optionLabel="label"
          optionValue="value"
          className="w-full"
          filter
          virtualScrollerOptions={{ itemSize: 36 }}
        />
      </div>

      <div className="field mt-3">
        <label htmlFor="diagram-edge-kind" className="font-semibold mb-2 block">Тип проводки</label>
        <Dropdown
          inputId="diagram-edge-kind"
          value={formData.kind}
          onChange={(event) => setFormData({ ...formData, kind: event.value })}
          options={[
            { label: 'Проводник', value: 'wire' },
            { label: 'Силовая', value: 'power' },
            { label: 'Сигнальная', value: 'signal' },
            { label: 'Аварийная', value: 'alert' },
          ]}
          className="w-full"
        />
      </div>

      <div className="field mt-3">
        <label htmlFor="diagram-edge-label" className="font-semibold mb-2 block">Подпись линии</label>
        <InputText
          id="diagram-edge-label"
          value={formData.label || ''}
          onChange={(event) => setFormData({ ...formData, label: event.target.value })}
          placeholder="Необязательно"
        />
      </div>

      <div className="diagram-widget-form__position mt-3">
        <label className="diagram-widget-form__position-field">
          <span>Сторона источника</span>
          <Dropdown
            value={formData.sourceSide || 'top'}
            onChange={(event) => setFormData({ ...formData, sourceSide: event.value })}
            options={ANCHOR_SIDE_OPTIONS}
            optionLabel="label"
            optionValue="value"
            className="p-dropdown"
          />
        </label>
        <label className="diagram-widget-form__position-field">
          <span>Сторона приёмника</span>
          <Dropdown
            value={formData.targetSide || 'bottom'}
            onChange={(event) => setFormData({ ...formData, targetSide: event.value })}
            options={ANCHOR_SIDE_OPTIONS}
            optionLabel="label"
            optionValue="value"
            className="p-dropdown"
          />
        </label>
      </div>

      <div className="form-actions mt-4">
        <Button label="Сохранить" icon="pi pi-check" onClick={handleSave} />
        {onDelete && canDelete ? (
          <Button
            label="Удалить связь"
            icon="pi pi-trash"
            severity="danger"
            outlined
            onClick={() => onDelete(formData.id)}
          />
        ) : null}
        <Button label="Отмена" icon="pi pi-times" severity="secondary" onClick={onCancel} />
      </div>
    </div>
  );
};

export default function DiagramWidgetsPage({ title }: Props) {
  const queryClient = useQueryClient();
  const [layouts, setLayouts] = useState<DiagramLayoutItem[]>([]);
  const [selectedEdge, setSelectedEdge] = useState('');
  const [selectedEdgePath, setSelectedEdgePath] = useState<Edge[]>([]);
  const [selectedPage, setSelectedPage] = useState('');
  const [editingItem, setEditingItem] = useState<DiagramLayoutItem | null>(null);
  const [editingDecoration, setEditingDecoration] = useState<DiagramDecorationNode | null>(null);
  const [editingPageEdge, setEditingPageEdge] = useState<DiagramDecorationEdge | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showDecorationForm, setShowDecorationForm] = useState(false);
  const [showPageEdgeForm, setShowPageEdgeForm] = useState(false);
  const [librarySearch, setLibrarySearch] = useState('');
  const [zoom, setZoom] = useState(1);
  const [fitRequestKey, setFitRequestKey] = useState(0);
  const [selectedWidgetIds, setSelectedWidgetIds] = useState<string[]>([]);
  const [historyPast, setHistoryPast] = useState<LayoutHistoryEntry[]>([]);
  const [historyFuture, setHistoryFuture] = useState<LayoutHistoryEntry[]>([]);
  const [pageConfig, setPageConfig] = useState<DiagramPageConfig>(createEmptyDiagramPageConfig('', ''));

  const layoutsRef = useRef<DiagramLayoutItem[]>([]);
  const pageConfigRef = useRef<DiagramPageConfig>(createEmptyDiagramPageConfig('', ''));
  const persistenceQueueRef = useRef<{
    save: Map<string, DiagramLayoutItem>;
    remove: Map<string, Pick<DiagramLayoutItem, 'id' | 'edge_id' | 'tag_id'>>;
    timer: ReturnType<typeof setTimeout> | null;
  }>({
    save: new Map(),
    remove: new Map(),
    timer: null,
  });
  const pagePersistenceQueueRef = useRef<{
    config: DiagramPageConfig | null;
    timer: ReturnType<typeof setTimeout> | null;
  }>({
    config: null,
    timer: null,
  });
  const pageConfigHydratedPageRef = useRef('');
  const isHydratingRef = useRef(true);

  useEffect(() => {
    layoutsRef.current = layouts;
  }, [layouts]);

  useEffect(() => {
    pageConfigRef.current = pageConfig;
  }, [pageConfig]);

  const { data: tags } = useQuery({
    queryKey: ['tags'],
    queryFn: getTagsForAdmin,
  });

  const { data: customizations } = useQuery({
    queryKey: ['diagram-widget-customizations'],
    queryFn: getAllWidgetConfigs,
    refetchOnWindowFocus: false,
  });

  const { data: diagramConfigData } = useQuery({
    queryKey: ['diagram-page-config', selectedPage],
    queryFn: () => getDiagramConfigByPage(selectedPage),
    enabled: Boolean(selectedPage),
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!customizations) {
      return;
    }

    const nextLayouts: DiagramLayoutItem[] = [];

    customizations.forEach((customization: any) => {
      if (!customization?.edge_id || !customization?.tag_id || !customization?.config) {
        return;
      }

      try {
        const config = typeof customization.config === 'string'
          ? JSON.parse(customization.config)
          : customization.config;

        if (!isSchemeWidgetType(config.widgetType)) {
          return;
        }

        nextLayouts.push({
          id: `${customization.edge_id}-${customization.tag_id}`,
          edge_id: customization.edge_id,
          tag_id: customization.tag_id,
          page: config.page,
          widgetType: config.widgetType,
          position: config.position ?? { x: 60, y: 60 },
          zIndex: typeof config.zIndex === 'number' ? config.zIndex : undefined,
          customLabel: config.customLabel,
          displayType: config.displayType,
          connections: Array.isArray(config.connections)
            ? config.connections
                .map((item: string | DiagramConnection) =>
                  typeof item === 'string'
                    ? { targetTagId: item, kind: 'signal' as DiagramConnectionKind }
                    : item?.targetTagId
                      ? { targetTagId: item.targetTagId, kind: item.kind ?? 'signal' }
                      : null
                )
                .filter((item): item is DiagramConnection => item !== null)
            : [],
        });
      } catch (error) {
        console.error('Не удалось прочитать конфигурацию схемного элемента', error);
      }
    });

    isHydratingRef.current = true;
    setLayouts(nextLayouts);
    layoutsRef.current = nextLayouts;
    setSelectedWidgetIds([]);
    setHistoryPast([]);
    setHistoryFuture([]);
    isHydratingRef.current = false;
  }, [customizations]);

  useEffect(() => {
    return () => {
      if (persistenceQueueRef.current.timer) {
        clearTimeout(persistenceQueueRef.current.timer);
      }

      if (pagePersistenceQueueRef.current.timer) {
        clearTimeout(pagePersistenceQueueRef.current.timer);
      }
    };
  }, []);

  const sortedTags = useMemo(() => sortTagsByName(tags || []), [tags]);
  const filteredTags = useMemo(() => getFilteredAndSortedTags(sortedTags, selectedEdge), [sortedTags, selectedEdge]);
  const tagNames = useMemo(() => new Map(sortedTags.map((tag) => [tag.id, tag.name])), [sortedTags]);
  const availablePages = useMemo(() => getAvailablePages(selectedEdge, selectedEdgePath), [selectedEdge, selectedEdgePath]);

  useEffect(() => {
    if (!selectedEdge || !availablePages.length) {
      setSelectedPage('');
      return;
    }

    setSelectedPage((current) => {
      if (current && availablePages.some((page) => page.value === current)) {
        return current;
      }
      const preferred = availablePages.find((page) => page.value === selectedEdge);
      return preferred?.value ?? availablePages[0]?.value ?? '';
    });
  }, [selectedEdge, availablePages]);

  useEffect(() => {
    if (!selectedPage) {
      return;
    }

    setFitRequestKey((current) => current + 1);
  }, [selectedPage]);

  useEffect(() => {
    if (!selectedPage) {
      const empty = createEmptyDiagramPageConfig('', '');
      setPageConfig(empty);
      pageConfigRef.current = empty;
      pageConfigHydratedPageRef.current = '';
      return;
    }

    const ownerEdgeId = getDiagramPageOwnerEdgeId(selectedPage);
    const hydrated = normalizeDiagramPageConfig(
      selectedPage,
      diagramConfigData
        ? {
            page: selectedPage,
            ownerEdgeId: diagramConfigData.ownerEdgeId || ownerEdgeId,
            backgroundUrl: diagramConfigData.backgroundUrl,
            backgroundOpacity: diagramConfigData.backgroundOpacity,
            backgroundFit: diagramConfigData.backgroundFit,
            viewport: diagramConfigData.viewport ?? null,
            items: diagramConfigData.items ?? [],
            edges: diagramConfigData.edges ?? [],
          }
        : createEmptyDiagramPageConfig(selectedPage)
    );

    const nextSerialized = JSON.stringify(serializeDiagramPageConfig(hydrated));
    const currentSerialized = JSON.stringify(serializeDiagramPageConfig(pageConfigRef.current));
    if (pageConfigHydratedPageRef.current === selectedPage && currentSerialized === nextSerialized) {
      return;
    }

    isHydratingRef.current = true;
    setPageConfig(hydrated);
    pageConfigRef.current = hydrated;
    setSelectedWidgetIds([]);
    setHistoryPast([]);
    setHistoryFuture([]);
    pageConfigHydratedPageRef.current = selectedPage;
    isHydratingRef.current = false;
  }, [diagramConfigData, selectedPage]);

  const saveMutation = useMutation({
    mutationFn: async (item: DiagramLayoutItem) => {
      try {
        await deleteTagCustomization(item.edge_id, item.tag_id, 'widgetConfig');
      } catch {
        // ignore missing record
      }

      const { id, edge_id, tag_id, ...config } = item;
      return createTagCustomization({
        edge_id,
        tag_id,
        key: 'widgetConfig',
        value: JSON.stringify(config),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['diagram-widget-customizations'] });
    },
  });

  const pageConfigMutation = useMutation({
    mutationFn: async (config: DiagramPageConfig) => {
      const ownerEdgeId = config.ownerEdgeId || getDiagramPageOwnerEdgeId(config.page);
      const key = getDiagramPageCustomizationKey(config.page);
      const value = JSON.stringify(serializeDiagramPageConfig({
        ...config,
        ownerEdgeId,
      }));

      try {
        return await updateEdgeCustomization(ownerEdgeId, key, { value });
      } catch {
        return createEdgeCustomization({
          edge_id: ownerEdgeId,
          key,
          value,
        });
      }
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['diagram-page-config', variables.page] });
    },
  });

  const flushPersistenceQueue = useCallback(() => {
    const queuedSave = Array.from(persistenceQueueRef.current.save.values());
    const queuedRemove = Array.from(persistenceQueueRef.current.remove.values());

    persistenceQueueRef.current.save.clear();
    persistenceQueueRef.current.remove.clear();
    persistenceQueueRef.current.timer = null;

    queuedRemove.forEach((item) => {
      deleteTagCustomization(item.edge_id, item.tag_id, 'widgetConfig').catch(() => undefined);
    });

    queuedSave.forEach((item) => {
      saveMutation.mutate(item);
    });
  }, [saveMutation]);

  const flushPagePersistenceQueue = useCallback(() => {
    const nextConfig = pagePersistenceQueueRef.current.config;
    pagePersistenceQueueRef.current.config = null;
    pagePersistenceQueueRef.current.timer = null;

    if (nextConfig) {
      pageConfigMutation.mutate(nextConfig);
    }
  }, [pageConfigMutation]);

  const queueLayoutPersistence = useCallback((items: DiagramLayoutItem[]) => {
    items.forEach((item) => {
      persistenceQueueRef.current.remove.delete(item.id);
      persistenceQueueRef.current.save.set(item.id, cloneLayoutItem(item));
    });

    if (persistenceQueueRef.current.timer) {
      clearTimeout(persistenceQueueRef.current.timer);
    }

    persistenceQueueRef.current.timer = setTimeout(flushPersistenceQueue, AUTOSAVE_DELAY_MS);
  }, [flushPersistenceQueue]);

  const queueLayoutRemoval = useCallback((items: DiagramLayoutItem[]) => {
    items.forEach((item) => {
      persistenceQueueRef.current.save.delete(item.id);
      persistenceQueueRef.current.remove.set(item.id, {
        id: item.id,
        edge_id: item.edge_id,
        tag_id: item.tag_id,
      });
    });

    if (persistenceQueueRef.current.timer) {
      clearTimeout(persistenceQueueRef.current.timer);
    }

    persistenceQueueRef.current.timer = setTimeout(flushPersistenceQueue, AUTOSAVE_DELAY_MS);
  }, [flushPersistenceQueue]);

  const queuePagePersistence = useCallback((config: DiagramPageConfig) => {
    pagePersistenceQueueRef.current.config = cloneDiagramPageConfig(config);

    if (pagePersistenceQueueRef.current.timer) {
      clearTimeout(pagePersistenceQueueRef.current.timer);
    }

    pagePersistenceQueueRef.current.timer = setTimeout(flushPagePersistenceQueue, AUTOSAVE_DELAY_MS);
  }, [flushPagePersistenceQueue]);

  const syncLayoutPersistence = useCallback((previousLayouts: DiagramLayoutItem[], nextLayouts: DiagramLayoutItem[]) => {
    const previousMap = new Map(previousLayouts.map((item) => [item.id, item]));
    const nextMap = new Map(nextLayouts.map((item) => [item.id, item]));
    const toSave: DiagramLayoutItem[] = [];
    const toRemove: DiagramLayoutItem[] = [];

    nextLayouts.forEach((item) => {
      const previous = previousMap.get(item.id);
      if (!previous || JSON.stringify(previous) !== JSON.stringify(item)) {
        toSave.push(item);
      }
    });

    previousLayouts.forEach((item) => {
      if (!nextMap.has(item.id)) {
        toRemove.push(item);
      }
    });

    if (toRemove.length) {
      queueLayoutRemoval(toRemove);
    }

    if (toSave.length) {
      queueLayoutPersistence(toSave);
    }
  }, [queueLayoutPersistence, queueLayoutRemoval]);

  const syncPagePersistence = useCallback((previousConfig: DiagramPageConfig, nextConfig: DiagramPageConfig) => {
    const previousSerialized = JSON.stringify(serializeDiagramPageConfig(previousConfig));
    const nextSerialized = JSON.stringify(serializeDiagramPageConfig(nextConfig));

    if (previousSerialized !== nextSerialized) {
      queuePagePersistence(nextConfig);
    }
  }, [queuePagePersistence]);

  const pushHistoryEntry = useCallback((entry: LayoutHistoryEntry) => {
    setHistoryPast((current) => [...current.slice(-(MAX_HISTORY_ENTRIES - 1)), entry]);
    setHistoryFuture([]);
  }, []);

  const commitLayouts = useCallback((
    nextLayouts: DiagramLayoutItem[],
    options?: {
      selectedIds?: string[];
      recordHistory?: boolean;
      syncPersistence?: boolean;
    }
  ) => {
    const previousLayouts = cloneLayouts(layoutsRef.current);
    const previousPageConfig = cloneDiagramPageConfig(pageConfigRef.current);
    const previousSelection = [...selectedWidgetIds];
    const selectedIds = options?.selectedIds ?? selectedWidgetIds;

    if (options?.recordHistory !== false && !isHydratingRef.current) {
      pushHistoryEntry({
        layouts: previousLayouts,
        pageConfig: previousPageConfig,
        selectedWidgetIds: previousSelection,
      });
    }

    setLayouts(nextLayouts);
    layoutsRef.current = nextLayouts;
    setSelectedWidgetIds(selectedIds);

    if (options?.syncPersistence !== false && !isHydratingRef.current) {
      syncLayoutPersistence(previousLayouts, nextLayouts);
      syncPagePersistence(previousPageConfig, pageConfigRef.current);
    }
  }, [pushHistoryEntry, selectedWidgetIds, syncLayoutPersistence, syncPagePersistence]);

  const allPageLayouts = useMemo(() => {
    return layouts.filter((item) => item.edge_id === selectedEdge && item.page === selectedPage);
  }, [layouts, selectedEdge, selectedPage]);

  const pageDecorations = useMemo(() => {
    return pageConfig.page === selectedPage ? pageConfig.items : [];
  }, [pageConfig, selectedPage]);

  const pageEdges = useMemo(() => {
    return pageConfig.page === selectedPage ? pageConfig.edges : [];
  }, [pageConfig, selectedPage]);

  const pageLayouts = allPageLayouts;

  const selectedPageName = useMemo(() => {
    return availablePages.find((item) => item.value === selectedPage)?.label || selectedPage;
  }, [availablePages, selectedPage]);

  const pageNodeOptions = useMemo(() => ([
    ...allPageLayouts.map((item) => ({
      value: item.id,
      label: `[Тег] ${getWidgetDisplayLabel(item, tagNames)}`,
    })),
    ...pageDecorations.map((item) => ({
      value: item.id,
      label: `[${getDiagramDecorationDefinition(item.type).label}] ${getDecorationDisplayTitle(item)}`,
    })),
  ]), [allPageLayouts, pageDecorations, tagNames]);

  useEffect(() => {
    const visibleIds = new Set([
      ...allPageLayouts.map((item) => item.id),
      ...pageDecorations.map((item) => item.id),
    ]);
    setSelectedWidgetIds((current) => current.filter((id) => visibleIds.has(id)));
  }, [allPageLayouts, pageDecorations]);

  const activeWidgetIds = useMemo(() => {
    const selectedVisible = selectedWidgetIds.filter((id) => allPageLayouts.some((item) => item.id === id));
    return selectedVisible.length > 0 ? selectedVisible : pageLayouts.map((item) => item.id);
  }, [selectedWidgetIds, allPageLayouts, pageLayouts]);

  const activeWidgets = useMemo(() => {
    const activeIds = new Set(activeWidgetIds);
    return pageLayouts.filter((item) => activeIds.has(item.id));
  }, [pageLayouts, activeWidgetIds]);

  const handleEdgeSelect = (edgeId: string, edgePath: Edge[]) => {
    setSelectedEdge(edgeId);
    setSelectedEdgePath(edgePath);
    setSelectedWidgetIds([]);
    setSelectedPage(edgeId);
  };

  const handleSelectWidget = useCallback((item: { id: string }, append: boolean) => {
    setSelectedWidgetIds((current) => {
      if (append) {
        return current.includes(item.id)
          ? current.filter((id) => id !== item.id)
          : [...current, item.id];
      }

      return current.length === 1 && current[0] === item.id ? [] : [item.id];
    });
  }, []);

  const handleCanvasSelection = useCallback((ids: string[], append: boolean) => {
    setSelectedWidgetIds((current) => {
      if (append) {
        return Array.from(new Set([...current, ...ids]));
      }

      return ids;
    });
  }, []);

  const openCreateDialog = (widgetType: SchemeWidgetType) => {
    if (!selectedEdge || !selectedPage) {
      return;
    }

    setEditingItem({
      id: `new-${Date.now()}`,
      edge_id: selectedEdge,
      tag_id: filteredTags[0]?.id || '',
      page: selectedPage,
      widgetType,
      position: normalizeWidgetPosition({ x: 100, y: 120 }, widgetType),
      customLabel: '',
      displayType: 'widget',
      connections: [],
    });
    setShowForm(true);
  };

  const openCreateDecorationDialog = (type: DiagramDecorationNodeType) => {
    if (!selectedPage) {
      return;
    }

    const nextItem = createDefaultDiagramDecorationNode(type, `dec-${Date.now()}`, { x: 120, y: 140 });
    setEditingDecoration({
      ...nextItem,
      position: normalizeDecorationPosition(nextItem.position, nextItem),
    });
    setShowDecorationForm(true);
  };

  const openCreatePageEdgeDialog = () => {
    if (!selectedPage || pageNodeOptions.length < 2) {
      return;
    }

    setEditingPageEdge({
      id: `edge-${Date.now()}`,
      source: pageNodeOptions[0]?.value || '',
      target: pageNodeOptions[1]?.value || '',
      sourceSide: 'bottom',
      targetSide: 'top',
      kind: 'wire',
    });
    setShowPageEdgeForm(true);
  };

  const handleMoveWidgets = useCallback((items: Array<{ id: string; position: { x: number; y: number } }>) => {
    if (!items.length) {
      return;
    }

    const nextPositions = new Map(items.map((item) => [item.id, item.position]));
    let hasChanges = false;

    const updated = layoutsRef.current.map((item) => {
      const nextPosition = nextPositions.get(item.id);
      if (!nextPosition) {
        return item;
      }

      hasChanges = true;
      return {
        ...item,
        position: normalizeWidgetPosition(nextPosition, item.widgetType),
      };
    });

    const nextPageConfig: DiagramPageConfig = {
      ...pageConfigRef.current,
      items: pageConfigRef.current.items.map((item) => {
        const nextPosition = nextPositions.get(item.id);
        if (!nextPosition) {
          return item;
        }

        hasChanges = true;
        return {
          ...item,
          position: normalizeDecorationPosition(nextPosition, item),
        };
      }),
    };

    if (!hasChanges) {
      return;
    }

    const changed = items.map((item) => item.id);
    const previousPageConfig = cloneDiagramPageConfig(pageConfigRef.current);

    commitLayouts(updated, { selectedIds: changed });
    setPageConfig(nextPageConfig);
    pageConfigRef.current = nextPageConfig;
    if (!isHydratingRef.current) {
      syncPagePersistence(previousPageConfig, nextPageConfig);
    }
  }, [commitLayouts, syncPagePersistence]);

  const handleSaveWidget = (item: DiagramLayoutItem) => {
    const normalizedId = `${item.edge_id}-${item.tag_id}`;
    const nextItem = {
      ...item,
      id: normalizedId,
      position: normalizeWidgetPosition(item.position, item.widgetType),
    };
    const existsIndex = layoutsRef.current.findIndex((layout) => layout.id === normalizedId);
    const nextLayouts = [...layoutsRef.current];

    if (existsIndex >= 0) {
      nextLayouts[existsIndex] = nextItem;
    } else {
      nextLayouts.push(nextItem);
    }

    commitLayouts(nextLayouts, { selectedIds: [nextItem.id] });
    setShowForm(false);
    setEditingItem(null);
  };

  const handleSaveDecoration = (item: DiagramDecorationNode) => {
    const normalized = {
      ...item,
      position: normalizeDecorationPosition(item.position, item),
    };
    const nextItems = [...pageConfigRef.current.items];
    const existingIndex = nextItems.findIndex((current) => current.id === normalized.id);

    if (existingIndex >= 0) {
      nextItems[existingIndex] = normalized;
    } else {
      nextItems.push(normalized);
    }

    const previousPageConfig = cloneDiagramPageConfig(pageConfigRef.current);
    const nextPageConfig: DiagramPageConfig = {
      ...pageConfigRef.current,
      page: selectedPage,
      ownerEdgeId: getDiagramPageOwnerEdgeId(selectedPage),
      items: nextItems,
    };

    setPageConfig(nextPageConfig);
    pageConfigRef.current = nextPageConfig;
    if (!isHydratingRef.current) {
      syncPagePersistence(previousPageConfig, nextPageConfig);
    }

    setSelectedWidgetIds([normalized.id]);
    setShowDecorationForm(false);
    setEditingDecoration(null);
  };

  const handleSavePageEdge = (item: DiagramDecorationEdge) => {
    const nextEdges = [...pageConfigRef.current.edges];
    const existingIndex = nextEdges.findIndex((edge) => edge.id === item.id);

    if (existingIndex >= 0) {
      nextEdges[existingIndex] = item;
    } else {
      nextEdges.push(item);
    }

    const previousPageConfig = cloneDiagramPageConfig(pageConfigRef.current);
    const nextPageConfig: DiagramPageConfig = {
      ...pageConfigRef.current,
      page: selectedPage,
      ownerEdgeId: getDiagramPageOwnerEdgeId(selectedPage),
      edges: nextEdges,
    };

    setPageConfig(nextPageConfig);
    pageConfigRef.current = nextPageConfig;
    if (!isHydratingRef.current) {
      syncPagePersistence(previousPageConfig, nextPageConfig);
    }

    setShowPageEdgeForm(false);
    setEditingPageEdge(null);
  };

  const handleDeletePageEdge = useCallback((id: string) => {
    const target = pageConfigRef.current.edges.find((edge) => edge.id === id);
    if (!target) {
      return;
    }

    const displayLabel = getPageEdgeDisplayLabel(target, allPageLayouts, pageDecorations, tagNames);

    confirmDialog({
      message: `Удалить связь "${displayLabel}"?`,
      header: 'Подтверждение удаления',
      icon: 'pi pi-exclamation-triangle',
      acceptClassName: 'p-button-danger',
      accept: () => {
        const previousPageConfig = cloneDiagramPageConfig(pageConfigRef.current);
        const nextPageConfig: DiagramPageConfig = {
          ...pageConfigRef.current,
          edges: pageConfigRef.current.edges.filter((edge) => edge.id !== id),
        };

        setPageConfig(nextPageConfig);
        pageConfigRef.current = nextPageConfig;
        if (editingPageEdge?.id === id) {
          setEditingPageEdge(null);
          setShowPageEdgeForm(false);
        }
        if (!isHydratingRef.current) {
          syncPagePersistence(previousPageConfig, nextPageConfig);
        }
      },
    });
  }, [allPageLayouts, editingPageEdge?.id, pageDecorations, syncPagePersistence, tagNames]);

  const handleDeleteWidget = (id: string) => {
    const widget = layoutsRef.current.find((item) => item.id === id);
    const decoration = pageConfigRef.current.items.find((item) => item.id === id);
    if (!widget && !decoration) {
      return;
    }

    if (!widget && decoration) {
      confirmDialog({
        message: `Удалить page-level элемент ${getDecorationDisplayTitle(decoration)}?`,
        header: 'Подтверждение удаления',
        icon: 'pi pi-exclamation-triangle',
        acceptClassName: 'p-button-danger',
        accept: () => {
          const previousPageConfig = cloneDiagramPageConfig(pageConfigRef.current);
          const nextPageConfig: DiagramPageConfig = {
            ...pageConfigRef.current,
            items: pageConfigRef.current.items.filter((item) => item.id !== id),
            edges: pageConfigRef.current.edges.filter((edge) => edge.source !== id && edge.target !== id),
          };

          setPageConfig(nextPageConfig);
          pageConfigRef.current = nextPageConfig;
          setSelectedWidgetIds((current) => current.filter((itemId) => itemId !== id));
          if (!isHydratingRef.current) {
            syncPagePersistence(previousPageConfig, nextPageConfig);
          }
        },
      });
      return;
    }

    confirmDialog({
      message: `Удалить элемент для тега ${tagNames.get(widget.tag_id) || widget.tag_id}?`,
      header: 'Подтверждение удаления',
      icon: 'pi pi-exclamation-triangle',
      acceptClassName: 'p-button-danger',
      accept: () => {
        if (!widget && decoration) {
          const previousPageConfig = cloneDiagramPageConfig(pageConfigRef.current);
          const nextPageConfig: DiagramPageConfig = {
            ...pageConfigRef.current,
            items: pageConfigRef.current.items.filter((item) => item.id !== id),
            edges: pageConfigRef.current.edges.filter((edge) => edge.source !== id && edge.target !== id),
          };

          setPageConfig(nextPageConfig);
          pageConfigRef.current = nextPageConfig;
          setSelectedWidgetIds((current) => current.filter((itemId) => itemId !== id));
          if (!isHydratingRef.current) {
            syncPagePersistence(previousPageConfig, nextPageConfig);
          }
          return;
        }

        commitLayouts(
          layoutsRef.current.filter((item) => item.id !== id),
          {
            selectedIds: selectedWidgetIds.filter((itemId) => itemId !== id),
          }
        );
      },
    });
  };

  const handleDuplicateWidget = useCallback((id: string) => {
    const source = layoutsRef.current.find((item) => item.id === id);
    if (source) {
      setEditingItem({
        ...cloneLayoutItem(source),
        id: `new-${Date.now()}`,
        tag_id: '',
        position: normalizeWidgetPosition(
          {
            x: source.position.x + 18,
            y: source.position.y + 18,
          },
          source.widgetType
        ),
      });
      setShowForm(true);
      return;
    }

    const decoration = pageConfigRef.current.items.find((item) => item.id === id);
    if (!decoration) {
      return;
    }

    const cloned = cloneDecorationNode(decoration);
    setEditingDecoration({
      ...cloned,
      id: `dec-${Date.now()}`,
      position: normalizeDecorationPosition(
        {
          x: cloned.position.x + 18,
          y: cloned.position.y + 18,
        },
        cloned,
      ),
    });
    setShowDecorationForm(true);
  }, []);

  const handleUndo = useCallback(() => {
    if (!historyPast.length) {
      return;
    }

    const previous = historyPast[historyPast.length - 1];
    const currentEntry: LayoutHistoryEntry = {
      layouts: cloneLayouts(layoutsRef.current),
      pageConfig: cloneDiagramPageConfig(pageConfigRef.current),
      selectedWidgetIds: [...selectedWidgetIds],
    };

    setHistoryPast((current) => current.slice(0, -1));
    setHistoryFuture((current) => [currentEntry, ...current]);
    setLayouts(cloneLayouts(previous.layouts));
    layoutsRef.current = cloneLayouts(previous.layouts);
    setPageConfig(cloneDiagramPageConfig(previous.pageConfig));
    pageConfigRef.current = cloneDiagramPageConfig(previous.pageConfig);
    setSelectedWidgetIds([...previous.selectedWidgetIds]);
    syncLayoutPersistence(currentEntry.layouts, previous.layouts);
    syncPagePersistence(currentEntry.pageConfig, previous.pageConfig);
  }, [historyPast, selectedWidgetIds, syncLayoutPersistence, syncPagePersistence]);

  const handleRedo = useCallback(() => {
    if (!historyFuture.length) {
      return;
    }

    const next = historyFuture[0];
    const currentEntry: LayoutHistoryEntry = {
      layouts: cloneLayouts(layoutsRef.current),
      pageConfig: cloneDiagramPageConfig(pageConfigRef.current),
      selectedWidgetIds: [...selectedWidgetIds],
    };

    setHistoryFuture((current) => current.slice(1));
    setHistoryPast((current) => [...current.slice(-(MAX_HISTORY_ENTRIES - 1)), currentEntry]);
    setLayouts(cloneLayouts(next.layouts));
    layoutsRef.current = cloneLayouts(next.layouts);
    setPageConfig(cloneDiagramPageConfig(next.pageConfig));
    pageConfigRef.current = cloneDiagramPageConfig(next.pageConfig);
    setSelectedWidgetIds([...next.selectedWidgetIds]);
    syncLayoutPersistence(currentEntry.layouts, next.layouts);
    syncPagePersistence(currentEntry.pageConfig, next.pageConfig);
  }, [historyFuture, selectedWidgetIds, syncLayoutPersistence, syncPagePersistence]);

  useEffect(() => {
    if (!selectedWidgetIds.length || showForm) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement) {
        const tagName = event.target.tagName.toLowerCase();
        if (tagName === 'input' || tagName === 'textarea' || tagName === 'select' || event.target.isContentEditable) {
          return;
        }
      }

      const commandPressed = event.ctrlKey || event.metaKey;

      if (commandPressed && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault();
        handleUndo();
        return;
      }

      if (commandPressed && (event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey))) {
        event.preventDefault();
        handleRedo();
        return;
      }

      if (event.key === 'Delete' && selectedWidgetIds.length === 1) {
        event.preventDefault();
        handleDeleteWidget(selectedWidgetIds[0]);
        return;
      }

      const delta = event.shiftKey ? 10 : 1;
      let dx = 0;
      let dy = 0;

      if (event.key === 'ArrowLeft') dx = -delta;
      if (event.key === 'ArrowRight') dx = delta;
      if (event.key === 'ArrowUp') dy = -delta;
      if (event.key === 'ArrowDown') dy = delta;
      if (dx === 0 && dy === 0) return;

      event.preventDefault();
      const selectedIds = new Set(selectedWidgetIds);
      const updatedLayouts = layoutsRef.current.map((item) => {
        if (!selectedIds.has(item.id)) {
          return item;
        }

        return {
          ...item,
          position: normalizeWidgetPosition(
            {
              x: item.position.x + dx,
              y: item.position.y + dy,
            },
            item.widgetType
          ),
        };
      });

      const previousPageConfig = cloneDiagramPageConfig(pageConfigRef.current);
      const nextPageConfig: DiagramPageConfig = {
        ...pageConfigRef.current,
        items: pageConfigRef.current.items.map((item) => {
          if (!selectedIds.has(item.id)) {
            return item;
          }

          return {
            ...item,
            position: normalizeDecorationPosition(
              {
                x: item.position.x + dx,
                y: item.position.y + dy,
              },
              item,
            ),
          };
        }),
      };

      commitLayouts(updatedLayouts, { selectedIds: Array.from(selectedIds) });
      setPageConfig(nextPageConfig);
      pageConfigRef.current = nextPageConfig;
      syncPagePersistence(previousPageConfig, nextPageConfig);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commitLayouts, handleDeleteWidget, handleRedo, handleUndo, selectedWidgetIds, showForm, syncPagePersistence]);

  const libraryGroups = useMemo(() => {
    const normalized = librarySearch.trim().toLowerCase();
    const filtered = SCHEME_WIDGET_LIBRARY.filter((widget) => {
      if (!REFERENCE_SCHEME_WIDGET_TYPES.has(widget.type)) {
        return false;
      }

      if (!normalized) {
        return true;
      }

      return (
        widget.label.toLowerCase().includes(normalized) ||
        widget.description.toLowerCase().includes(normalized) ||
        widget.category.toLowerCase().includes(normalized)
      );
    });

    const groups = new Map<string, typeof filtered>();
    filtered.forEach((widget) => {
      const current = groups.get(widget.category) ?? [];
      current.push(widget);
      groups.set(widget.category, current);
    });

    return Array.from(groups.entries()).map(([category, items]) => ({ category, items }));
  }, [librarySearch]);

  const decorationLibraryGroups = useMemo(() => {
    const normalized = librarySearch.trim().toLowerCase();
    const filtered = DIAGRAM_DECORATION_LIBRARY.filter((item) => {
      if (!REFERENCE_DECORATION_TYPES.has(item.type)) {
        return false;
      }

      if (!normalized) {
        return true;
      }

      return (
        item.label.toLowerCase().includes(normalized) ||
        item.description.toLowerCase().includes(normalized) ||
        item.category.toLowerCase().includes(normalized)
      );
    });

    const groups = new Map<string, typeof filtered>();
    filtered.forEach((item) => {
      const current = groups.get(item.category) ?? [];
      current.push(item);
      groups.set(item.category, current);
    });

    return Array.from(groups.entries()).map(([category, items]) => ({ category, items }));
  }, [librarySearch]);

  const totalLibraryItems = useMemo(
    () => libraryGroups.reduce((sum, group) => sum + group.items.length, 0) + decorationLibraryGroups.reduce((sum, group) => sum + group.items.length, 0),
    [decorationLibraryGroups, libraryGroups]
  );

  const stats = {
    total: pageLayouts.length + pageDecorations.length,
    linked: pageLayouts.filter((item) => (item.connections ?? []).length > 0).length + pageEdges.length,
    categories: new Set([
      ...pageLayouts.map((item) => getSchemeWidgetDefinition(item.widgetType).category),
      ...pageDecorations.map((item) => getDiagramDecorationDefinition(item.type).category),
    ]).size,
  };

  return (
    <ReactFlowProvider>
      <div className="diagram-admin-page">
        <div className="diagram-admin-page__hero">
          <PageHeader
            kicker="Схема"
            title={title}
            description="Редактор схемных элементов: точное размещение, направляющие выравнивания и история действий."
          />
          <div className="diagram-admin-page__hero-stats">
            <div>
              <strong>{stats.total}</strong>
              <span>элементов</span>
            </div>
            <div>
              <strong>{stats.linked}</strong>
              <span>со связями</span>
            </div>
            <div>
              <strong>{stats.categories}</strong>
              <span>категорий</span>
            </div>
          </div>
        </div>

        {saveMutation.error ? (
          <Message
            severity="error"
            text={`Ошибка сохранения: ${getErrorMessage(saveMutation.error, 'Не удалось сохранить элемент.')}`}
          />
        ) : null}

        <div className="diagram-admin-page__content">
          <aside className="diagram-admin-sidebar">
            <AppCard className="diagram-admin-card">
              <h3>Оборудование</h3>
              <EdgeTreeSelector selectedEdgeId={selectedEdge} onSelectEdge={handleEdgeSelect} />
            </AppCard>

            <AppCard className="diagram-admin-card">
              <h3>Маршрут</h3>
              {selectedEdge ? (
                <EdgePathDisplay edgePath={selectedEdgePath} />
              ) : (
                <p className="diagram-admin-muted">Выберите оборудование, чтобы открыть страницы схемы.</p>
              )}
            </AppCard>

            <AppCard className="diagram-admin-card diagram-admin-card--library">
              <div className="diagram-admin-card__title-row">
                <h3>Библиотека элементов</h3>
                <span>{totalLibraryItems}</span>
              </div>

              <input
                type="text"
                className="p-inputtext diagram-admin-library__search"
                placeholder="Поиск по библиотеке"
                value={librarySearch}
                onChange={(event) => setLibrarySearch(event.target.value)}
              />

              <div className="diagram-admin-library">
                {libraryGroups.map((group) => (
                  <section key={group.category} className="diagram-admin-library__group">
                    <header>
                      <h4>{group.category}</h4>
                      <span>{group.items.length}</span>
                    </header>
                    <div className="diagram-admin-library__grid">
                      {group.items.map((widgetType) => (
                        <button
                          key={widgetType.type}
                          type="button"
                          className="diagram-admin-library__item"
                          onClick={() => openCreateDialog(widgetType.type)}
                          disabled={!selectedEdge || !selectedPage}
                        >
                          <SchemeWidgetPreview type={widgetType.type} active />
                          <div>
                            <strong>{widgetType.label}</strong>
                            <span>{widgetType.description}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
                {decorationLibraryGroups.map((group) => (
                  <section key={`decoration-${group.category}`} className="diagram-admin-library__group">
                    <header>
                      <h4>{group.category}</h4>
                      <span>{group.items.length}</span>
                    </header>
                    <div className="diagram-admin-library__grid">
                      {group.items.map((item) => (
                        <button
                          key={item.type}
                          type="button"
                          className="diagram-admin-library__item"
                          onClick={() => openCreateDecorationDialog(item.type)}
                          disabled={!selectedPage}
                        >
                          <DiagramDecorationPreview
                            item={createDefaultDiagramDecorationNode(item.type, 'preview', { x: 0, y: 0 })}
                            widthOverride={72}
                            heightOverride={72}
                          />
                          <div>
                            <strong>{item.label}</strong>
                            <span>{item.description}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </AppCard>
          </aside>

          <section className="diagram-admin-workspace">
            <div className="diagram-admin-toolbar">
              <div className="diagram-admin-toolbar__bar" role="group" aria-label="Панель управления схемой">
                <Button
                  label="Проводка"
                  icon="pi pi-share-alt"
                  size="small"
                  severity="secondary"
                  disabled={!selectedPage || pageNodeOptions.length < 2}
                  onClick={openCreatePageEdgeDialog}
                />
                <Button icon="pi pi-undo" text rounded size="small" disabled={!historyPast.length} onClick={handleUndo} tooltip="Undo" />
                <Button icon="pi pi-refresh" text rounded size="small" disabled={!historyFuture.length} onClick={handleRedo} tooltip="Redo" />
              </div>
            </div>

            {selectedEdge && selectedPage ? (
              <DiagramCanvas
                selectedPage={selectedPage}
                selectedPageName={selectedPageName}
                widgets={pageLayouts}
                decorations={pageDecorations}
                pageEdges={pageEdges}
                fitRequestKey={fitRequestKey}
                selectedWidgetIds={selectedWidgetIds}
                tagNames={tagNames}
                zoom={zoom}
                onZoomChange={setZoom}
                onSelectionChange={handleCanvasSelection}
                onMoveNodes={handleMoveWidgets}
                onEditWidget={(widget) => {
                  setEditingItem(widget);
                  setShowForm(true);
                }}
                onEditDecoration={(item) => {
                  setEditingDecoration(item);
                  setShowDecorationForm(true);
                }}
                onDuplicate={handleDuplicateWidget}
                onDelete={handleDeleteWidget}
              />
            ) : (
              <div className="diagram-admin-empty diagram-admin-empty--idle">
                <i className="pi pi-compass" />
                <strong>Выберите оборудование</strong>
                <span>После выбора станет доступно полотно для настройки схемных элементов и связей.</span>
              </div>
            )}

            <div className="diagram-admin-card">
              <div className="diagram-admin-card__title-row">
                <h3>Элементы текущей страницы</h3>
                <span>{pageLayouts.length + pageDecorations.length}</span>
              </div>
              {pageLayouts.length ? (
                <div className="diagram-admin-list">
                  {pageLayouts.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      className={`diagram-admin-list__item ${selectedWidgetIds.includes(item.id) ? 'is-selected' : ''}`}
                      onClick={() => {
                        handleSelectWidget(item, false);
                      }}
                      onDoubleClick={() => {
                        setEditingItem(item);
                        setShowForm(true);
                      }}
                    >
                      <SchemeWidgetPreview type={item.widgetType} active={false} />
                      <div>
                        <strong>{item.customLabel || tagNames.get(item.tag_id) || item.tag_id}</strong>
                        <span>
                          {getSchemeWidgetDefinition(item.widgetType).label} · X {Math.round(item.position.x)} · Y {Math.round(item.position.y)} · Связей {(item.connections ?? []).length}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="diagram-admin-muted">На выбранной странице еще нет схемных элементов.</p>
              )}
              {pageDecorations.length ? (
                <>
                  <h4 className="diagram-admin-subsection-title">Page-level элементы</h4>
                  <div className="diagram-admin-list">
                    {pageDecorations.map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        className={`diagram-admin-list__item ${selectedWidgetIds.includes(item.id) ? 'is-selected' : ''}`}
                        onClick={() => {
                          handleSelectWidget(item, false);
                        }}
                        onDoubleClick={() => {
                          setEditingDecoration(item);
                          setShowDecorationForm(true);
                        }}
                      >
                        <DiagramDecorationPreview item={item} widthOverride={72} heightOverride={72} />
                        <div>
                          <strong>{getDecorationDisplayTitle(item)}</strong>
                          <span>
                            {getDiagramDecorationDefinition(item.type).label} · X {Math.round(item.position.x)} · Y {Math.round(item.position.y)}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              ) : null}

              {pageEdges.length ? (
                <>
                  <h4 className="diagram-admin-subsection-title">Проводки</h4>
                  <div className="diagram-admin-list">
                    {pageEdges.map((edge) => (
                      <div key={edge.id} className="diagram-admin-list__item diagram-admin-list__item--edge">
                        <button
                          type="button"
                          className="diagram-admin-list__item-main"
                          onClick={() => {
                            setEditingPageEdge(edge);
                            setShowPageEdgeForm(true);
                          }}
                        >
                          <div className={`diagram-admin-list__edge-line diagram-admin-list__edge-line--${edge.kind}`} />
                          <div>
                            <strong>{getPageEdgeDisplayLabel(edge, allPageLayouts, pageDecorations, tagNames)}</strong>
                            <span>{edge.kind} · {edge.sourceSide || 'auto'} → {edge.targetSide || 'auto'}</span>
                          </div>
                        </button>
                        <Button
                          type="button"
                          icon="pi pi-trash"
                          text
                          rounded
                          severity="danger"
                          aria-label={`Удалить связь ${getPageEdgeDisplayLabel(edge, allPageLayouts, pageDecorations, tagNames)}`}
                          onClick={() => handleDeletePageEdge(edge.id)}
                        />
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          </section>
        </div>

        <Dialog
          visible={showForm}
          header={editingItem?.id.startsWith('new-') ? 'Новый схемный элемент' : 'Редактирование схемного элемента'}
          className="responsive-dialog responsive-dialog-md p-fluid admin-dialog"
          modal
          onHide={() => {
            setShowForm(false);
            setEditingItem(null);
          }}
        >
          <DiagramWidgetForm
            item={editingItem}
            tags={filteredTags}
            pages={availablePages}
            pageWidgets={allPageLayouts}
            tagNames={tagNames}
            onSave={handleSaveWidget}
            onCancel={() => {
              setShowForm(false);
              setEditingItem(null);
            }}
          />
        </Dialog>

        <Dialog
          visible={showDecorationForm}
          header={editingDecoration?.id.startsWith('dec-') ? 'Page-level элемент' : 'Редактирование page-level элемента'}
          className="responsive-dialog responsive-dialog-md p-fluid admin-dialog"
          modal
          onHide={() => {
            setShowDecorationForm(false);
            setEditingDecoration(null);
          }}
        >
          <DiagramDecorationForm
            item={editingDecoration}
            tags={filteredTags}
            onSave={handleSaveDecoration}
            onCancel={() => {
              setShowDecorationForm(false);
              setEditingDecoration(null);
            }}
          />
        </Dialog>

        <Dialog
          visible={showPageEdgeForm}
          header={editingPageEdge?.id.startsWith('edge-') ? 'Новая проводка' : 'Редактирование проводки'}
          className="responsive-dialog responsive-dialog-md p-fluid admin-dialog"
          modal
          onHide={() => {
            setShowPageEdgeForm(false);
            setEditingPageEdge(null);
          }}
        >
          <DiagramPageEdgeForm
            item={editingPageEdge}
            nodeOptions={pageNodeOptions}
            onSave={handleSavePageEdge}
            onDelete={handleDeletePageEdge}
            canDelete={Boolean(editingPageEdge && pageEdges.some((edge) => edge.id === editingPageEdge.id))}
            onCancel={() => {
              setShowPageEdgeForm(false);
              setEditingPageEdge(null);
            }}
          />
        </Dialog>

        <ConfirmDialog />
      </div>
    </ReactFlowProvider>
  );
}
