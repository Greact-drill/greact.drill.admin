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
import {
  createTagCustomization,
  deleteTagCustomization,
  getAllWidgetConfigs,
  getTagsForAdmin,
  type Edge,
  type Tag,
} from '../api/admin';
import {
  getSchemeWidgetDefinition,
  isSchemeWidgetType,
  SCHEME_WIDGET_LIBRARY,
  type SchemeWidgetType,
} from '../lib/schemeWidgets';
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

interface CanvasSelectionBox {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  append: boolean;
}

interface SmartSnapGuides {
  x?: number;
  y?: number;
}

interface DiagramFlowNodeData {
  item: DiagramLayoutItem;
  tagName: string;
  hasAlarm: boolean;
  onEdit: (item: DiagramLayoutItem) => void;
  onDelete: (id: string) => void;
}

interface DiagramFlowEdgeData {
  kind: DiagramConnectionKind;
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

const ADMIN_PREVIEW_SCALE = 0.82;
const ADMIN_WIDGET_PREVIEW_SIZE = 72;
const SNAP_THRESHOLD = 14;
const GRID_OFFSET = 16;
const MIN_ZOOM = 0.45;
const MAX_ZOOM = 1.4;

function clampWidgetPosition(position: { x: number; y: number }, widgetType: SchemeWidgetType) {
  const definition = getSchemeWidgetDefinition(widgetType);

  return {
    x: Math.max(GRID_OFFSET, Math.min(Math.round(position.x), CANVAS_LIMITS.width - definition.width - GRID_OFFSET)),
    y: Math.max(GRID_OFFSET, Math.min(Math.round(position.y), CANVAS_LIMITS.height - definition.height - GRID_OFFSET)),
  };
}

function normalizeWidgetPosition(position: { x: number; y: number }, widgetType: SchemeWidgetType) {
  return clampWidgetPosition(position, widgetType);
}

function clampZoomValue(value: number) {
  return Math.max(MIN_ZOOM, Math.min(Number(value.toFixed(2)), MAX_ZOOM));
}

function getAdminPreviewDimensions(widgetType: SchemeWidgetType) {
  void widgetType;

  return {
    width: ADMIN_WIDGET_PREVIEW_SIZE,
    height: ADMIN_WIDGET_PREVIEW_SIZE,
  };
}

function getScaledCanvasPosition(position: { x: number; y: number }) {
  return {
    x: Math.round(position.x * ADMIN_PREVIEW_SCALE),
    y: Math.round(position.y * ADMIN_PREVIEW_SCALE),
  };
}

function getFlowNodeCenterFromWidget(position: { x: number; y: number }) {
  const scaled = getScaledCanvasPosition(position);

  return {
    x: scaled.x + (ADMIN_WIDGET_PREVIEW_SIZE / 2),
    y: scaled.y + (ADMIN_WIDGET_PREVIEW_SIZE / 2),
  };
}

function getWidgetPositionFromFlowNodeCenter(center: { x: number; y: number }) {
  return {
    x: (center.x - (ADMIN_WIDGET_PREVIEW_SIZE / 2)) / ADMIN_PREVIEW_SCALE,
    y: (center.y - (ADMIN_WIDGET_PREVIEW_SIZE / 2)) / ADMIN_PREVIEW_SCALE,
  };
}

function clampFlowNodeCenterPosition(center: { x: number; y: number }) {
  return {
    x: Math.max(ADMIN_WIDGET_PREVIEW_SIZE / 2, Math.min(center.x, CANVAS_LIMITS.width * ADMIN_PREVIEW_SCALE - (ADMIN_WIDGET_PREVIEW_SIZE / 2))),
    y: Math.max(ADMIN_WIDGET_PREVIEW_SIZE / 2, Math.min(center.y, CANVAS_LIMITS.height * ADMIN_PREVIEW_SCALE - (ADMIN_WIDGET_PREVIEW_SIZE / 2))),
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
  { label: '55%', value: 0.55 },
  { label: '65%', value: 0.65 },
  { label: '70%', value: 0.7 },
  { label: '85%', value: 0.85 },
  { label: '100%', value: 1 },
];

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

function getWidgetCenter(item: DiagramLayoutItem) {
  return getFlowNodeCenterFromWidget(item.position);
}

type AnchorSide = 'left' | 'right' | 'top' | 'bottom';

function getHandleId(side: AnchorSide, type: 'source' | 'target') {
  return `${type}-${side}`;
}

function getConnectionSide(source: DiagramLayoutItem, target: DiagramLayoutItem): AnchorSide {
  const sourceCenter = getWidgetCenter(source);
  const targetCenter = getWidgetCenter(target);
  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? 'right' : 'left';
  }

  return dy >= 0 ? 'bottom' : 'top';
}

function getEdgeColor(kind: DiagramConnectionKind) {
  switch (kind) {
    case 'power':
      return 'rgba(232, 201, 160, 0.82)';
    case 'alert':
      return 'rgba(255, 122, 122, 0.9)';
    case 'signal':
    default:
      return 'rgba(123, 211, 255, 0.82)';
  }
}

function getWidgetAnchor(item: DiagramLayoutItem, target: DiagramLayoutItem) {
  const definition = getAdminPreviewDimensions(item.widgetType);
  const position = getScaledCanvasPosition(item.position);
  const sourceCenter = getWidgetCenter(item);
  const targetCenter = getWidgetCenter(target);
  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return {
      x: dx >= 0 ? position.x + definition.width : position.x,
      y: sourceCenter.y,
      side: (dx >= 0 ? 'right' : 'left') as AnchorSide,
    };
  }

  return {
    x: sourceCenter.x,
    y: dy >= 0 ? position.y + definition.height : position.y,
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
  const label = data.tagName;
  const definition = getSchemeWidgetDefinition(data.item.widgetType);

  return (
    <div
      className={`diagram-admin-canvas-widget ${dragging ? 'is-dragging' : ''} ${data.hasAlarm ? 'is-alarm' : ''} ${selected ? 'is-selected' : ''}`}
      title={label}
    >
      <Handle id={getHandleId('left', 'source')} type="source" position={Position.Left} isConnectable={false} className="diagram-admin-flow-node__handle" />
      <Handle id={getHandleId('right', 'source')} type="source" position={Position.Right} isConnectable={false} className="diagram-admin-flow-node__handle" />
      <Handle id={getHandleId('top', 'source')} type="source" position={Position.Top} isConnectable={false} className="diagram-admin-flow-node__handle" />
      <Handle id={getHandleId('bottom', 'source')} type="source" position={Position.Bottom} isConnectable={false} className="diagram-admin-flow-node__handle" />
      <Handle id={getHandleId('left', 'target')} type="target" position={Position.Left} isConnectable={false} className="diagram-admin-flow-node__handle" />
      <Handle id={getHandleId('right', 'target')} type="target" position={Position.Right} isConnectable={false} className="diagram-admin-flow-node__handle" />
      <Handle id={getHandleId('top', 'target')} type="target" position={Position.Top} isConnectable={false} className="diagram-admin-flow-node__handle" />
      <Handle id={getHandleId('bottom', 'target')} type="target" position={Position.Bottom} isConnectable={false} className="diagram-admin-flow-node__handle" />

      <div className="diagram-admin-canvas-widget__symbol">
        <SchemeWidgetPreview type={data.item.widgetType} active={!data.hasAlarm} alarm={data.hasAlarm} />
      </div>
      <div className="diagram-admin-canvas-widget__meta">
        <strong>{label}</strong>
        <span>{definition.label}</span>
      </div>
      <div className="diagram-admin-canvas-widget__actions nodrag nopan">
        <Button icon="pi pi-pencil" text rounded size="small" onClick={(event) => { event.stopPropagation(); data.onEdit(data.item); }} />
        <Button icon="pi pi-trash" text rounded severity="danger" size="small" onClick={(event) => { event.stopPropagation(); data.onDelete(data.item.id); }} />
      </div>
    </div>
  );
};

const FLOW_NODE_TYPES = {
  diagramWidget: DiagramFlowNode,
};

const DiagramFlowEdge: React.FC<FlowEdgeProps<FlowEdge<DiagramFlowEdgeData>>> = ({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style, data }) => {
  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 12,
    offset: 18,
  });

  return (
    <BaseEdge
      path={path}
      markerEnd={markerEnd}
      style={{
        ...style,
        stroke: getEdgeColor(data?.kind ?? 'signal'),
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
  selectedWidgetIds: string[];
  tagNames: Map<string, string>;
  zoom: number;
  onZoomChange?: (zoom: number) => void;
  onSelectionChange: (ids: string[], append: boolean) => void;
  onMoveWidgets: (items: Array<{ id: string; position: { x: number; y: number } }>) => void;
  onEdit: (item: DiagramLayoutItem) => void;
  onDelete: (id: string) => void;
}> = ({ selectedPage, selectedPageName, widgets, selectedWidgetIds, tagNames, zoom, onZoomChange, onSelectionChange, onMoveWidgets, onEdit, onDelete }) => {
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<FlowNode<DiagramFlowNodeData>, FlowEdge<DiagramFlowEdgeData>> | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const dragSessionRef = useRef<{
    primaryId: string;
    originals: Map<string, { x: number; y: number }>;
    frame: number | null;
  } | null>(null);
  const [dragIndicator, setDragIndicator] = useState<{ x: number; y: number } | null>(null);

  const nodesFromProps = useMemo<FlowNode<DiagramFlowNodeData>[]>(() => (
    widgets.map((item) => ({
      id: item.id,
      type: 'diagramWidget',
      position: getFlowNodeCenterFromWidget(item.position),
      data: {
        item,
        tagName: tagNames.get(item.tag_id) || item.tag_id,
        hasAlarm: Boolean(item.connections?.some((connection) => connection.kind === 'alert')),
        onEdit,
        onDelete,
      },
      selected: selectedWidgetIds.includes(item.id),
      draggable: true,
      selectable: true,
    }))
  ), [onDelete, onEdit, selectedWidgetIds, tagNames, widgets]);
  const [draftNodes, setDraftNodes] = useState<FlowNode<DiagramFlowNodeData>[]>(nodesFromProps);

  const widgetMap = useMemo(() => new Map(widgets.map((widget) => [widget.tag_id, widget])), [widgets]);

  const edges = useMemo<FlowEdge<DiagramFlowEdgeData>[]>(() => (
    widgets.flatMap((widget) =>
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
            },
            style: {
              strokeWidth: connection.kind === 'power' ? 3.5 : 2.5,
            },
          };
        })
        .filter((item): item is FlowEdge<DiagramFlowEdgeData> => item !== null)
    )
  ), [widgetMap, widgets]);

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

    const pointer = flowInstance.screenToFlowPosition({ x: clientX, y: clientY });
    const primaryOriginal = dragSessionRef.current.originals.get(primaryId);
    if (!primaryOriginal) {
      return null;
    }

    const deltaX = pointer.x - primaryOriginal.x;
    const deltaY = pointer.y - primaryOriginal.y;
    const moved = new Map<string, { x: number; y: number }>();

    dragSessionRef.current.originals.forEach((original, id) => {
      moved.set(id, clampFlowNodeCenterPosition({
        x: original.x + deltaX,
        y: original.y + deltaY,
      }));
    });

    return moved;
  }, [flowInstance]);

  const syncDraftNodes = useCallback((moved: Map<string, { x: number; y: number }>) => {
    setDraftNodes((current) => current.map((node) => {
      const nextPosition = moved.get(node.id);
      return nextPosition ? { ...node, position: nextPosition } : node;
    }));
  }, []);

  const updateDragIndicator = useCallback((clientX: number, clientY: number) => {
    const surface = surfaceRef.current;
    if (!surface) {
      return;
    }

    const bounds = surface.getBoundingClientRect();
    setDragIndicator({
      x: clientX - bounds.left,
      y: clientY - bounds.top,
    });
  }, []);

  return (
    <div className="diagram-admin-canvas" data-page={selectedPage}>
      <div className="diagram-admin-canvas__header">
        <div>
          <h3>{selectedPageName}</h3>
          <p>Размещайте элементы прямо на полотне, выделяйте рамкой, перетаскивайте группами и открывайте свойства двойным кликом.</p>
        </div>
        <div className="diagram-admin-canvas__badge">{selectedPage}</div>
      </div>
      <div ref={surfaceRef} className="diagram-admin-canvas__surface diagram-admin-canvas__surface--flow">
        {dragIndicator ? (
          <div
            className="diagram-admin-canvas__drag-indicator"
            style={{
              left: `${dragIndicator.x}px`,
              top: `${dragIndicator.y}px`,
            }}
          />
        ) : null}
        <ReactFlow
          nodes={draftNodes}
          edges={edges}
          nodeTypes={FLOW_NODE_TYPES}
          edgeTypes={FLOW_EDGE_TYPES}
          onInit={setFlowInstance}
          onSelectionChange={handleSelectionChange}
          onNodeDoubleClick={(_, node) => onEdit(node.data.item)}
          onNodeDragStart={(event, node, draggedNodes) => {
            const dragGroup = draggedNodes.length ? draggedNodes : [node];
            const originals = new Map(
              dragGroup.map((draggedNode) => [
                draggedNode.id,
                { x: draggedNode.position.x, y: draggedNode.position.y },
              ])
            );

            dragSessionRef.current = {
              primaryId: node.id,
              originals,
              frame: null,
            };

            const moved = applyDragPointerPosition(event.clientX, event.clientY, node.id);
            if (moved) {
              updateDragIndicator(event.clientX, event.clientY);
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

            updateDragIndicator(event.clientX, event.clientY);

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
            const moved = applyDragPointerPosition(event.clientX, event.clientY, node.id) ?? new Map(
              dragGroup.map((draggedNode) => [
                draggedNode.id,
                clampFlowNodeCenterPosition(draggedNode.position),
              ])
            );

            if (dragSessionRef.current?.frame !== null) {
              cancelAnimationFrame(dragSessionRef.current.frame);
            }

            syncDraftNodes(moved);
            onMoveWidgets(
              dragGroup.map((draggedNode) => ({
                id: draggedNode.id,
                position: normalizeWidgetPosition(
                  getWidgetPositionFromFlowNodeCenter(moved.get(draggedNode.id) ?? draggedNode.position),
                  draggedNode.data.item.widgetType
                ),
              }))
            );
            dragSessionRef.current = null;
            setDragIndicator(null);
          }}
          onPaneClick={() => onSelectionChange([], false)}
          onPaneMouseLeave={() => setDragIndicator(null)}
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
          snapGrid={[8, 8]}
          selectionOnDrag
          selectionMode={SelectionMode.Partial}
          selectNodesOnDrag={false}
          panOnDrag={[1]}
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
          nodeExtent={[[ADMIN_WIDGET_PREVIEW_SIZE / 2, ADMIN_WIDGET_PREVIEW_SIZE / 2], [CANVAS_LIMITS.width * ADMIN_PREVIEW_SCALE - (ADMIN_WIDGET_PREVIEW_SIZE / 2), CANVAS_LIMITS.height * ADMIN_PREVIEW_SCALE - (ADMIN_WIDGET_PREVIEW_SIZE / 2)]]}
          translateExtent={[[-120, -120], [CANVAS_LIMITS.width * ADMIN_PREVIEW_SCALE + 120, CANVAS_LIMITS.height * ADMIN_PREVIEW_SCALE + 120]]}
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

  useEffect(() => {
    setFormData(item);
    setError('');
  }, [item]);

  if (!formData) {
    return null;
  }

  const definition = getSchemeWidgetDefinition(formData.widgetType);
  const connectionCandidates = pageWidgets.filter((widget) => widget.id !== formData.id && widget.page === formData.page);

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

  const toggleConnection = (tagId: string) => {
    const current = [...(formData.connections ?? [])];
    const existingIndex = current.findIndex((item) => item.targetTagId === tagId);

    if (existingIndex >= 0) {
      current.splice(existingIndex, 1);
    } else {
      current.push({ targetTagId: tagId, kind: 'signal' });
    }

    setFormData({ ...formData, connections: current });
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
        <select
          id="diagram-widget-tag"
          value={formData.tag_id}
          onChange={(event) => setFormData({ ...formData, tag_id: event.target.value })}
          className="p-dropdown w-full"
        >
          <option value="">Выберите тег</option>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name} ({tag.id})
            </option>
          ))}
        </select>
      </div>

      <div className="field mt-3">
        <label htmlFor="diagram-widget-page" className="font-semibold mb-2 block">Страница размещения</label>
        <select
          id="diagram-widget-page"
          value={formData.page}
          onChange={(event) => setFormData({ ...formData, page: event.target.value, connections: [] })}
          className="p-dropdown w-full"
        >
          {pages.map((page) => (
            <option key={page.value} value={page.value}>
              {page.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field mt-3">
        <label htmlFor="diagram-widget-type" className="font-semibold mb-2 block">Тип элемента</label>
        <select
          id="diagram-widget-type"
          value={formData.widgetType}
          onChange={(event) => {
            const widgetType = event.target.value as SchemeWidgetType;
            setFormData({
              ...formData,
              widgetType,
              position: normalizeWidgetPosition(formData.position, widgetType),
            });
          }}
          className="p-dropdown w-full"
        >
          {SCHEME_WIDGET_LIBRARY.map((type) => (
            <option key={type.type} value={type.type}>
              {type.label}
            </option>
          ))}
        </select>
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
          <div className="diagram-widget-form__connections">
            {connectionCandidates.map((widget) => (
              <label key={widget.id} className="diagram-widget-form__connection-item">
                <input
                  type="checkbox"
                  checked={(formData.connections ?? []).some((item) => item.targetTagId === widget.tag_id)}
                  onChange={() => toggleConnection(widget.tag_id)}
                />
                <SchemeWidgetPreview type={widget.widgetType} active={false} />
                <div className="diagram-widget-form__connection-meta">
                  <strong>{widget.customLabel || tagNames.get(widget.tag_id) || widget.tag_id}</strong>
                  <span>{getSchemeWidgetDefinition(widget.widgetType).label}</span>
                </div>
                <select
                  className="diagram-widget-form__connection-kind"
                  value={(formData.connections ?? []).find((item) => item.targetTagId === widget.tag_id)?.kind ?? 'signal'}
                  onChange={(event) => updateConnectionKind(widget.tag_id, event.target.value as DiagramConnectionKind)}
                  disabled={!(formData.connections ?? []).some((item) => item.targetTagId === widget.tag_id)}
                >
                  {CONNECTION_KIND_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        ) : (
          <p className="diagram-admin-muted">На этой странице пока нет других элементов для связи.</p>
        )}
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
                max={String(CANVAS_LIMITS.height - definition.height - GRID_OFFSET)}
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

export default function DiagramWidgetsPage({ title }: Props) {
  const queryClient = useQueryClient();
  const [layouts, setLayouts] = useState<DiagramLayoutItem[]>([]);
  const [selectedEdge, setSelectedEdge] = useState('');
  const [selectedEdgePath, setSelectedEdgePath] = useState<Edge[]>([]);
  const [selectedPage, setSelectedPage] = useState('');
  const [editingItem, setEditingItem] = useState<DiagramLayoutItem | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [librarySearch, setLibrarySearch] = useState('');
  const [zoom, setZoom] = useState(0.7);
  const [selectedWidgetIds, setSelectedWidgetIds] = useState<string[]>([]);

  const layoutsRef = useRef<DiagramLayoutItem[]>([]);
  const selectedWidgetIdsRef = useRef<string[]>([]);

  useEffect(() => {
    layoutsRef.current = layouts;
  }, [layouts]);

  useEffect(() => {
    selectedWidgetIdsRef.current = selectedWidgetIds;
  }, [selectedWidgetIds]);

  const { data: tags } = useQuery({
    queryKey: ['tags'],
    queryFn: getTagsForAdmin,
  });

  const { data: customizations } = useQuery({
    queryKey: ['diagram-widget-customizations'],
    queryFn: getAllWidgetConfigs,
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

    setLayouts(nextLayouts);
    layoutsRef.current = nextLayouts;
  }, [customizations]);

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
      return selectedEdge;
    });
  }, [selectedEdge, availablePages]);

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

  const allPageLayouts = useMemo(() => {
    return layouts.filter((item) => item.edge_id === selectedEdge && item.page === selectedPage);
  }, [layouts, selectedEdge, selectedPage]);

  const pageLayouts = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return allPageLayouts
      .filter((item) => {
        if (!normalizedSearch) {
          return true;
        }

        const tagName = tagNames.get(item.tag_id)?.toLowerCase() || '';
        const label = item.customLabel?.toLowerCase() || '';
        const widgetName = getSchemeWidgetDefinition(item.widgetType).label.toLowerCase();
        return tagName.includes(normalizedSearch) || label.includes(normalizedSearch) || widgetName.includes(normalizedSearch);
      });
  }, [allPageLayouts, search, tagNames]);

  const selectedPageName = useMemo(() => {
    return availablePages.find((item) => item.value === selectedPage)?.label || selectedPage;
  }, [availablePages, selectedPage]);

  useEffect(() => {
    const visibleIds = new Set(allPageLayouts.map((item) => item.id));
    setSelectedWidgetIds((current) => current.filter((id) => visibleIds.has(id)));
  }, [allPageLayouts]);

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
  };

  const handleSelectWidget = useCallback((item: DiagramLayoutItem, append: boolean) => {
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

  const handleMoveWidgets = useCallback((items: Array<{ id: string; position: { x: number; y: number } }>) => {
    if (!items.length) {
      return;
    }

    const nextPositions = new Map(items.map((item) => [item.id, item.position]));
    const updated = layoutsRef.current.map((item) => {
      const nextPosition = nextPositions.get(item.id);
      if (!nextPosition) {
        return item;
      }

      return {
        ...item,
        position: normalizeWidgetPosition(nextPosition, item.widgetType),
      };
    });

    const changed = updated.filter((item) => nextPositions.has(item.id));
    setLayouts(updated);
    setSelectedWidgetIds(changed.map((item) => item.id));
    changed.forEach((item) => saveMutation.mutate(item));
  }, [saveMutation]);

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

    setLayouts(nextLayouts);
    saveMutation.mutate(nextItem);
    setShowForm(false);
    setEditingItem(null);
    setSelectedWidgetIds([nextItem.id]);
  };

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

      setLayouts(updatedLayouts);
      updatedLayouts.filter((item) => selectedIds.has(item.id)).forEach((item) => saveMutation.mutate(item));
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saveMutation, selectedWidgetIds, showForm]);

  const handleDeleteWidget = (id: string) => {
    const widget = layoutsRef.current.find((item) => item.id === id);
    if (!widget) {
      return;
    }

    confirmDialog({
      message: `Удалить элемент для тега ${tagNames.get(widget.tag_id) || widget.tag_id}?`,
      header: 'Подтверждение удаления',
      icon: 'pi pi-exclamation-triangle',
      acceptClassName: 'p-button-danger',
        accept: () => {
          setLayouts(layoutsRef.current.filter((item) => item.id !== id));
          setSelectedWidgetIds((current) => current.filter((itemId) => itemId !== id));
          deleteTagCustomization(widget.edge_id, widget.tag_id, 'widgetConfig').catch(() => undefined);
        },
      });
  };

  const libraryGroups = useMemo(() => {
    const normalized = librarySearch.trim().toLowerCase();
    const filtered = SCHEME_WIDGET_LIBRARY.filter((widget) => {
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

  const stats = {
    total: pageLayouts.length,
    linked: pageLayouts.filter((item) => (item.connections ?? []).length > 0).length,
    categories: new Set(pageLayouts.map((item) => getSchemeWidgetDefinition(item.widgetType).category)).size,
  };

  const selectedSummary = activeWidgets.length
    ? `${activeWidgets.length} выбрано`
    : 'Нет выбора';

  return (
    <ReactFlowProvider>
      <div className="diagram-admin-page">
        <div className="diagram-admin-page__hero">
          <div>
            <h2>{title}</h2>
            <p>
              Настраивайте библиотеку схемных элементов цифрового двойника буровой, размещайте их на полотне,
              связывайте между собой и сохраняйте все в текущий `widgetConfig`.
            </p>
          </div>
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
            <div className="diagram-admin-card">
              <h3>Оборудование</h3>
              <EdgeTreeSelector selectedEdgeId={selectedEdge} onSelectEdge={handleEdgeSelect} />
            </div>

            <div className="diagram-admin-card">
              <h3>Маршрут</h3>
              {selectedEdge ? (
                <EdgePathDisplay edgePath={selectedEdgePath} />
              ) : (
                <p className="diagram-admin-muted">Выберите оборудование, чтобы открыть страницы схемы.</p>
              )}
            </div>

            <div className="diagram-admin-card diagram-admin-card--library">
              <div className="diagram-admin-card__title-row">
                <h3>Библиотека элементов</h3>
                <span>{SCHEME_WIDGET_LIBRARY.length}</span>
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
              </div>
            </div>
          </aside>

          <section className="diagram-admin-workspace">
            <div className="diagram-admin-toolbar">
              <div className="diagram-admin-toolbar__controls">
                <input
                  type="text"
                  className="p-inputtext"
                  placeholder="Поиск по тегу, подписи или типу"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <select
                  value={selectedPage}
                  onChange={(event) => setSelectedPage(event.target.value)}
                  className="p-dropdown"
                  disabled={!availablePages.length}
                >
                  {!availablePages.length ? <option value="">Сначала выберите оборудование</option> : null}
                  {availablePages.map((page) => (
                    <option key={page.value} value={page.value}>
                      {page.label}
                    </option>
                  ))}
                </select>
                <select
                  value={String(zoom)}
                  onChange={(event) => setZoom(clampZoomValue(Number(event.target.value)))}
                  className="p-dropdown diagram-admin-toolbar__zoom"
                >
                  {ZOOM_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      Масштаб {option.label}
                    </option>
                  ))}
                </select>
                <div className="diagram-admin-toolbar__selection">{selectedSummary}</div>
              </div>

              <div className="diagram-admin-toolbar__actions">
              </div>
            </div>

            {selectedEdge && selectedPage ? (
              <DiagramCanvas
                selectedPage={selectedPage}
                selectedPageName={selectedPageName}
                widgets={pageLayouts}
                selectedWidgetIds={selectedWidgetIds}
                tagNames={tagNames}
                zoom={zoom}
                onZoomChange={setZoom}
                onSelectionChange={handleCanvasSelection}
                onMoveWidgets={handleMoveWidgets}
                onEdit={(widget) => {
                  setEditingItem(widget);
                  setShowForm(true);
                }}
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
                <span>{pageLayouts.length}</span>
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

        <ConfirmDialog />
      </div>
    </ReactFlowProvider>
  );
}
