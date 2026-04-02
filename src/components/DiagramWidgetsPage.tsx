import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
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
import EdgePathDisplay from './EdgePathDisplay';
import EdgeTreeSelector from './EdgeTreeSelector';
import { getErrorMessage } from '../utils/errorUtils';
import { getFilteredAndSortedTags, sortTagsByName } from '../utils/tagUtils';

type DiagramWidgetType = 'signalLamp' | 'transistor';

interface DiagramWidgetConfig {
  page: string;
  widgetType: DiagramWidgetType;
  position: { x: number; y: number };
  customLabel?: string;
  displayType?: 'widget' | 'compact' | 'card';
}

interface DiagramLayoutItem extends DiagramWidgetConfig {
  id: string;
  edge_id: string;
  tag_id: string;
}

interface Props {
  title: string;
}

interface WidgetTypeOption {
  value: DiagramWidgetType;
  label: string;
  description: string;
  icon: string;
}

const DIAGRAM_WIDGET_TYPES: WidgetTypeOption[] = [
  {
    value: 'signalLamp',
    label: 'Сигнальная лампа',
    description: 'Круглый индикатор для состояния вкл/выкл.',
    icon: 'pi pi-circle-fill',
  },
  {
    value: 'transistor',
    label: 'Транзистор',
    description: 'Схемный элемент с акцентом на состояние цепи.',
    icon: 'pi pi-bolt',
  },
];

const CANVAS_LIMITS = {
  width: 1800,
  height: 920,
};

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

const getWidgetOption = (type: DiagramWidgetType) =>
  DIAGRAM_WIDGET_TYPES.find((item) => item.value === type) ?? DIAGRAM_WIDGET_TYPES[0];

const WidgetGlyph: React.FC<{ type: DiagramWidgetType; active?: boolean }> = ({ type, active = true }) => {
  if (type === 'signalLamp') {
    return (
      <div className={`diagram-widget-glyph diagram-widget-glyph--lamp ${active ? 'is-active' : 'is-idle'}`}>
        <span className="diagram-widget-glyph__lamp-core" />
      </div>
    );
  }

  return (
    <div className={`diagram-widget-glyph diagram-widget-glyph--transistor ${active ? 'is-active' : 'is-idle'}`}>
      <span className="diagram-widget-glyph__line diagram-widget-glyph__line--left" />
      <span className="diagram-widget-glyph__line diagram-widget-glyph__line--center" />
      <span className="diagram-widget-glyph__line diagram-widget-glyph__line--right" />
      <span className="diagram-widget-glyph__arrow" />
    </div>
  );
};

const DiagramDraggableWidget: React.FC<{
  item: DiagramLayoutItem;
  tagName: string;
  onEdit: (item: DiagramLayoutItem) => void;
  onDelete: (id: string) => void;
}> = ({ item, tagName, onEdit, onDelete }) => {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'diagram-widget',
    item: { id: item.id },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }));

  const option = getWidgetOption(item.widgetType);

  return (
    <div
      ref={drag as never}
      className={`diagram-admin-canvas-widget ${isDragging ? 'is-dragging' : ''}`}
      style={{ left: `${item.position.x}px`, top: `${item.position.y}px` }}
      onDoubleClick={() => onEdit(item)}
    >
      <div className="diagram-admin-canvas-widget__chrome" />
      <WidgetGlyph type={item.widgetType} />
      <div className="diagram-admin-canvas-widget__meta">
        <strong>{item.customLabel || tagName}</strong>
        <span>{option.label}</span>
      </div>
      <div className="diagram-admin-canvas-widget__actions">
        <Button icon="pi pi-pencil" text rounded size="small" onClick={() => onEdit(item)} />
        <Button icon="pi pi-trash" text rounded severity="danger" size="small" onClick={() => onDelete(item.id)} />
      </div>
    </div>
  );
};

const DiagramDropZone: React.FC<{
  selectedPage: string;
  selectedPageName: string;
  children: React.ReactNode;
  onDrop: (item: { id: string }, position: { x: number; y: number }) => void;
}> = ({ selectedPage, selectedPageName, children, onDrop }) => {
  const dropRef = useRef<HTMLDivElement>(null);

  const [{ isOver }, drop] = useDrop(() => ({
    accept: 'diagram-widget',
    drop: (item: { id: string }, monitor) => {
      const offset = monitor.getSourceClientOffset();
      const bounds = dropRef.current?.getBoundingClientRect();
      if (!offset || !bounds) {
        return;
      }

      onDrop(item, {
        x: offset.x - bounds.left,
        y: offset.y - bounds.top,
      });
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
  }));

  drop(dropRef);

  return (
    <div ref={dropRef} className={`diagram-admin-canvas ${isOver ? 'is-over' : ''}`} data-page={selectedPage}>
      <div className="diagram-admin-canvas__header">
        <div>
          <h3>{selectedPageName}</h3>
          <p>Перетаскивайте элементы по полотну и дважды кликайте для редактирования.</p>
        </div>
        <div className="diagram-admin-canvas__badge">{selectedPage}</div>
      </div>
      <div className="diagram-admin-canvas__surface">
        <div className="diagram-admin-canvas__grid" aria-hidden="true" />
        {children}
      </div>
    </div>
  );
};

const DiagramWidgetForm: React.FC<{
  item: DiagramLayoutItem | null;
  tags: Tag[];
  pages: Array<{ label: string; value: string }>;
  onSave: (item: DiagramLayoutItem) => void;
  onCancel: () => void;
}> = ({ item, tags, pages, onSave, onCancel }) => {
  const [formData, setFormData] = useState<DiagramLayoutItem | null>(item);
  const [error, setError] = useState('');

  useEffect(() => {
    setFormData(item);
    setError('');
  }, [item]);

  if (!formData) {
    return null;
  }

  const option = getWidgetOption(formData.widgetType);

  const handleSave = () => {
    if (!formData.tag_id || !formData.page || !formData.widgetType) {
      setError('Заполните обязательные поля: тег, страница и тип виджета.');
      return;
    }

    onSave({
      ...formData,
      displayType: formData.page.startsWith('MAIN_') ? 'compact' : 'widget',
    });
  };

  return (
    <div className="diagram-widget-form">
      {error ? <Message severity="error" text={error} className="mb-3" /> : null}

      <div className="diagram-widget-form__preview">
        <WidgetGlyph type={formData.widgetType} />
        <div>
          <strong>{option.label}</strong>
          <p>{option.description}</p>
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
          onChange={(event) => setFormData({ ...formData, page: event.target.value })}
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
        <label htmlFor="diagram-widget-type" className="font-semibold mb-2 block">Тип виджета</label>
        <select
          id="diagram-widget-type"
          value={formData.widgetType}
          onChange={(event) =>
            setFormData({ ...formData, widgetType: event.target.value as DiagramWidgetType })
          }
          className="p-dropdown w-full"
        >
          {DIAGRAM_WIDGET_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
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
          placeholder="Например: Питание насоса"
        />
      </div>

      <div className="field mt-3">
        <label className="font-semibold mb-2 block">Позиция</label>
        <div className="diagram-widget-form__position">
          <span>X: {Math.round(formData.position.x)}</span>
          <span>Y: {Math.round(formData.position.y)}</span>
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

  const layoutsRef = useRef<DiagramLayoutItem[]>([]);

  useEffect(() => {
    layoutsRef.current = layouts;
  }, [layouts]);

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

        if (config.widgetType !== 'signalLamp' && config.widgetType !== 'transistor') {
          return;
        }

        nextLayouts.push({
          id: `${customization.edge_id}-${customization.tag_id}`,
          edge_id: customization.edge_id,
          tag_id: customization.tag_id,
          page: config.page,
          widgetType: config.widgetType,
          position: config.position ?? { x: 40, y: 40 },
          customLabel: config.customLabel,
          displayType: config.displayType,
        });
      } catch (error) {
        console.error('Не удалось прочитать diagram widget config', error);
      }
    });

    setLayouts(nextLayouts);
    layoutsRef.current = nextLayouts;
  }, [customizations]);

  const sortedTags = useMemo(() => sortTagsByName(tags || []), [tags]);
  const filteredTags = useMemo(() => getFilteredAndSortedTags(sortedTags, selectedEdge), [sortedTags, selectedEdge]);
  const tagsMap = useMemo(() => new Map(sortedTags.map((tag) => [tag.id, tag.name])), [sortedTags]);
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
        // no-op
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

  const pageLayouts = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return layouts
      .filter((item) => item.edge_id === selectedEdge && item.page === selectedPage)
      .filter((item) => {
        if (!normalizedSearch) {
          return true;
        }

        const tagName = tagsMap.get(item.tag_id)?.toLowerCase() || '';
        const label = item.customLabel?.toLowerCase() || '';
        return tagName.includes(normalizedSearch) || label.includes(normalizedSearch);
      });
  }, [layouts, search, selectedEdge, selectedPage, tagsMap]);

  const selectedPageName = useMemo(() => {
    return availablePages.find((item) => item.value === selectedPage)?.label || selectedPage;
  }, [availablePages, selectedPage]);

  const handleEdgeSelect = (edgeId: string, edgePath: Edge[]) => {
    setSelectedEdge(edgeId);
    setSelectedEdgePath(edgePath);
  };

  const openCreateDialog = (widgetType: DiagramWidgetType) => {
    if (!selectedEdge || !selectedPage) {
      return;
    }

    setEditingItem({
      id: `new-${Date.now()}`,
      edge_id: selectedEdge,
      tag_id: filteredTags[0]?.id || '',
      page: selectedPage,
      widgetType,
      position: { x: 60, y: 80 },
      customLabel: '',
      displayType: selectedPage.startsWith('MAIN_') ? 'compact' : 'widget',
    });
    setShowForm(true);
  };

  const handleDrop = useCallback((draggedItem: { id: string }, position: { x: number; y: number }) => {
    const constrained = {
      x: Math.max(16, Math.min(position.x, CANVAS_LIMITS.width)),
      y: Math.max(24, Math.min(position.y, CANVAS_LIMITS.height)),
    };

    const updated = layoutsRef.current.map((item) =>
      item.id === draggedItem.id ? { ...item, position: constrained } : item
    );

    const changed = updated.find((item) => item.id === draggedItem.id);
    setLayouts(updated);
    if (changed) {
      saveMutation.mutate(changed);
    }
  }, [saveMutation]);

  const handleSaveWidget = (item: DiagramLayoutItem) => {
    const normalizedId = `${item.edge_id}-${item.tag_id}`;
    const nextItem = { ...item, id: normalizedId };
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
  };

  const handleDeleteWidget = (id: string) => {
    const widget = layoutsRef.current.find((item) => item.id === id);
    if (!widget) {
      return;
    }

    confirmDialog({
      message: `Удалить схемный виджет для тега ${tagsMap.get(widget.tag_id) || widget.tag_id}?`,
      header: 'Подтверждение удаления',
      icon: 'pi pi-exclamation-triangle',
      acceptClassName: 'p-button-danger',
      accept: () => {
        setLayouts(layoutsRef.current.filter((item) => item.id !== id));
        deleteTagCustomization(widget.edge_id, widget.tag_id, 'widgetConfig').catch(() => undefined);
      },
    });
  };

  const stats = {
    total: pageLayouts.length,
    lamps: pageLayouts.filter((item) => item.widgetType === 'signalLamp').length,
    transistors: pageLayouts.filter((item) => item.widgetType === 'transistor').length,
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="diagram-admin-page">
        <div className="diagram-admin-page__hero">
          <div>
            <h2>{title}</h2>
            <p>
              Размещайте схемные индикаторы на страницах оборудования. Каждый виджет привязан к одному тегу
              и переключается между состояниями «вкл/выкл» во `view`.
            </p>
          </div>
          <div className="diagram-admin-page__hero-stats">
            <div>
              <strong>{stats.total}</strong>
              <span>на странице</span>
            </div>
            <div>
              <strong>{stats.lamps}</strong>
              <span>ламп</span>
            </div>
            <div>
              <strong>{stats.transistors}</strong>
              <span>транзисторов</span>
            </div>
          </div>
        </div>

        {saveMutation.error ? (
          <Message
            severity="error"
            text={`Ошибка сохранения: ${getErrorMessage(saveMutation.error, 'Не удалось сохранить виджет.')}`}
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
                <p className="diagram-admin-muted">Выберите элемент дерева слева.</p>
              )}
            </div>

            <div className="diagram-admin-card">
              <h3>Библиотека виджетов</h3>
              <div className="diagram-admin-library">
                {DIAGRAM_WIDGET_TYPES.map((widgetType) => (
                  <button
                    key={widgetType.value}
                    type="button"
                    className="diagram-admin-library__item"
                    onClick={() => openCreateDialog(widgetType.value)}
                    disabled={!selectedEdge || !selectedPage}
                  >
                    <WidgetGlyph type={widgetType.value} />
                    <div>
                      <strong>{widgetType.label}</strong>
                      <span>{widgetType.description}</span>
                    </div>
                  </button>
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
                  placeholder="Поиск по тегу или подписи"
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
              </div>

              <div className="diagram-admin-toolbar__actions">
                <Button
                  label="Лампа"
                  icon="pi pi-plus-circle"
                  onClick={() => openCreateDialog('signalLamp')}
                  disabled={!selectedEdge || !selectedPage}
                />
                <Button
                  label="Транзистор"
                  icon="pi pi-bolt"
                  severity="secondary"
                  onClick={() => openCreateDialog('transistor')}
                  disabled={!selectedEdge || !selectedPage}
                />
                <Button
                  label="Обновить"
                  icon="pi pi-refresh"
                  severity="info"
                  onClick={() => queryClient.invalidateQueries({ queryKey: ['diagram-widget-customizations'] })}
                />
              </div>
            </div>

            {selectedEdge && selectedPage ? (
              <DiagramDropZone
                selectedPage={selectedPage}
                selectedPageName={selectedPageName}
                onDrop={handleDrop}
              >
                {pageLayouts.map((item) => (
                  <DiagramDraggableWidget
                    key={item.id}
                    item={item}
                    tagName={tagsMap.get(item.tag_id) || item.tag_id}
                    onEdit={(widget) => {
                      setEditingItem(widget);
                      setShowForm(true);
                    }}
                    onDelete={handleDeleteWidget}
                  />
                ))}
                {pageLayouts.length === 0 ? (
                  <div className="diagram-admin-empty">
                    <i className="pi pi-sitemap" />
                    <strong>Пока пусто</strong>
                    <span>Добавьте сигнальную лампу или транзистор и разместите их на полотне.</span>
                  </div>
                ) : null}
              </DiagramDropZone>
            ) : (
              <div className="diagram-admin-empty diagram-admin-empty--idle">
                <i className="pi pi-compass" />
                <strong>Выберите оборудование</strong>
                <span>После выбора буровой станет доступно полотно для размещения новых схемных виджетов.</span>
              </div>
            )}

            <div className="diagram-admin-card">
              <h3>Текущие виджеты страницы</h3>
              {pageLayouts.length ? (
                <div className="diagram-admin-list">
                  {pageLayouts.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      className="diagram-admin-list__item"
                      onClick={() => {
                        setEditingItem(item);
                        setShowForm(true);
                      }}
                    >
                      <WidgetGlyph type={item.widgetType} active={false} />
                      <div>
                        <strong>{item.customLabel || tagsMap.get(item.tag_id) || item.tag_id}</strong>
                        <span>
                          {getWidgetOption(item.widgetType).label} · X {Math.round(item.position.x)} · Y {Math.round(item.position.y)}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="diagram-admin-muted">На выбранной странице еще нет схемных виджетов.</p>
              )}
            </div>
          </section>
        </div>

        <Dialog
          visible={showForm}
          header={editingItem?.id.startsWith('new-') ? 'Новый схемный виджет' : 'Редактирование схемного виджета'}
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
            onSave={handleSaveWidget}
            onCancel={() => {
              setShowForm(false);
              setEditingItem(null);
            }}
          />
        </Dialog>

        <ConfirmDialog />
      </div>
    </DndProvider>
  );
}
