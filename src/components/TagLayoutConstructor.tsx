import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
    createTagCustomization, 
    deleteTagCustomization,
    getEdgeChildren,
    getTagsForAdmin,
    type Edge,
    type Tag,
    getAllWidgetConfigs
} from '../api/admin';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { Dropdown } from 'primereact/dropdown';
import { Message } from 'primereact/message';
import { InputText } from 'primereact/inputtext';
import EdgeTreeSelector from './EdgeTreeSelector';
import EdgePathDisplay from './EdgePathDisplay';
import { getErrorMessage } from '../utils/errorUtils';
import { sortTagsByName, getFilteredAndSortedTags } from '../utils/tagUtils';
import { useAppToast } from '../ui/ToastProvider';
import PageHeader from '../ui/PageHeader';
import { useDebouncedValue } from '../ui/useDebouncedValue';
import AppButton from '../ui/AppButton';

// Интерфейс для конфигурации виджета из JSON
interface WidgetConfig {
    page: string; // ID edge или 'MAIN_PAGE' для главной
    widgetType: 'gauge' | 'bar' | 'number' | 'value' | 'status' | 'alarm' | 'compact' | 'card';
    position: { x: number; y: number };
    customLabel?: string;
    displayType?: 'widget' | 'compact' | 'card'; // Как отображать на разных страницах
}

// Интерфейс для элемента layout (расширяет WidgetConfig)
interface LayoutItem extends WidgetConfig {
    id: string;
    edge_id: string;
    tag_id: string;
}

interface Props {
    title: string;
}

const WIDGET_TYPES = [
    { label: 'Манометр', value: 'gauge', icon: 'pi pi-chart-line' },
    { label: 'Вертикальная шкала', value: 'bar', icon: 'pi pi-chart-bar' },
    { label: 'Числовое значение', value: 'number', icon: 'pi pi-hashtag' },
    { label: 'Значение тега', value: 'value', icon: 'pi pi-tag' },
    { label: 'Статус', value: 'status', icon: 'pi pi-info-circle' },
    { label: 'Авария', value: 'alarm', icon: 'pi pi-bolt' }
];

// Генерация доступных страниц на основе выбранного edge
const getAvailablePages = (selectedEdge: string, edgePath: Edge[]): Array<{label: string, value: string}> => {
    const pages: Array<{label: string, value: string}> = [];
    
    // 1. Главная страница буровой (компактные виджеты)
    if (edgePath.length > 0) {
        const rootEdge = edgePath[0]; // Корневой элемент (буровая)
        pages.push({ 
            label: `Главная страница (${rootEdge.name})`, 
            value: `MAIN_${rootEdge.id}` 
        });
    }
    
    // 2. Страница выбранного edge (полноценные виджеты)
    pages.push({ 
        label: `Страница оборудования (${edgePath[edgePath.length - 1]?.name || selectedEdge})`, 
        value: selectedEdge 
    });

    // 2.1 Специальные страницы статусов (уникальные для буровой)
    if (edgePath.length > 0) {
        const rootEdge = edgePath[0];
        pages.push(
            { label: `Состояние байпасов (${rootEdge.name})`, value: `BYPASS_${rootEdge.id}` },
            { label: `Аварии приводов (${rootEdge.name})`, value: `ACCIDENT_${rootEdge.id}` }
        );
    }
    
    // 3. Родительские страницы (если есть)
    edgePath.forEach((edge, index) => {
        if (index < edgePath.length - 1) { // Все кроме текущего
            pages.push({ 
                label: `Родительская: ${edge.name}`, 
                value: edge.id 
            });
        }
    });
    
    return pages;
};

// Компонент виджета для перетаскивания
const DraggableWidget: React.FC<{ 
    item: LayoutItem; 
    tagName: string;
    onEdit: (item: LayoutItem) => void;
    onDelete: (id: string) => void;
}> = ({ item, tagName, onEdit, onDelete }) => {
    const [{ isDragging }, drag] = useDrag(() => ({
        type: 'widget',
        item: { id: item.id, currentPosition: item.position },
        collect: (monitor) => ({
            isDragging: monitor.isDragging(),
        }),
    }));

    const getWidgetIcon = (type: string) => {
        return WIDGET_TYPES.find(w => w.value === type)?.icon || 'pi pi-cog';
    };

    const getWidgetDisplayType = (item: LayoutItem) => {
        if (item.page.startsWith('MAIN_')) return 'main-page';
        return 'widget-page';
    };

    return (
        <div
            ref={drag as any}
            className={`widget-item ${isDragging ? 'dragging' : ''} ${getWidgetDisplayType(item)}`}
            style={{
                left: `${item.position.x}px`,
                top: `${item.position.y}px`,
            }}
            data-page-type={getWidgetDisplayType(item)}
        >
            <div className="widget-header">
                <i className={getWidgetIcon(item.widgetType)}></i>
                <span className="widget-label">
                    {item.customLabel || tagName || `Тег ${item.tag_id}`}
                </span>
            </div>
            <div className="widget-meta">
                <small className="widget-type">{item.widgetType}</small>
                <small className="widget-page-type">
                    {item.page.startsWith('MAIN_') ? 'Главная' : 'Страница'}
                </small>
            </div>
            <div className="widget-actions">
                <Button 
                    icon="pi pi-pencil" 
                    className="p-button-text p-button-sm" 
                    onClick={() => onEdit(item)}
                    tooltip="Редактировать"
                />
                <Button 
                    icon="pi pi-trash" 
                    className="p-button-text p-button-sm p-button-danger" 
                    onClick={() => onDelete(item.id)}
                    tooltip="Удалить"
                />
            </div>
        </div>
    );
};

// Область для размещения виджетов
const DropZone: React.FC<{ 
    page: string; 
    pageName: string;
    pageType: 'main' | 'widget';
    children: React.ReactNode;
    onDrop: (item: any, position: { x: number; y: number }) => void;
}> = ({ page, pageName, pageType, children, onDrop }) => {
    const dropRef = useRef<HTMLDivElement>(null);

    const [{ isOver }, drop] = useDrop(() => ({
        accept: 'widget',
        drop: (item: any, monitor) => {
            const offset = monitor.getSourceClientOffset();
            const dropZoneRect = dropRef.current?.getBoundingClientRect();
            
            if (offset && dropZoneRect) {
                const relativeX = offset.x - dropZoneRect.left;
                const relativeY = offset.y - dropZoneRect.top;
                
                onDrop(item, { x: relativeX, y: relativeY });
            }
        },
        collect: (monitor) => ({
            isOver: monitor.isOver(),
        }),
    }));

    drop(dropRef);

    const getZoneTitle = () => {
        if (pageType === 'main') return 'Главная страница (компактные виджеты)';
        return 'Страница оборудования (полноценные виджеты)';
    };

    return (
        <div 
            ref={dropRef}
            className={`drop-zone ${isOver ? 'drop-over' : ''} ${pageType}`}
            data-page={page}
        >
            <div className="drop-zone-header">
                <h3>{pageName}</h3>
                <div className="drop-zone-info">
                    <span className="zone-type">{getZoneTitle()}</span>
                    <span className="zone-id">ID: {page}</span>
                </div>
            </div>
            {children}
        </div>
    );
};

// Форма редактирования виджета
const WidgetForm: React.FC<{
    item: LayoutItem | null;
    tags: Tag[];
    availablePages: Array<{label: string, value: string}>;
    onSave: (item: LayoutItem) => void;
    onCancel: () => void;
}> = ({ item, tags, availablePages, onSave, onCancel }) => {
    const [formData, setFormData] = useState<LayoutItem>(item!);
    const [error, setError] = useState('');
    const tagSelectRef = useRef<any>(null);

    useEffect(() => {
        if (item) {
            const normalizedWidgetType =
                item.widgetType === 'compact' || item.widgetType === 'card'
                    ? 'number'
                    : item.widgetType;
            setFormData({ ...item, widgetType: normalizedWidgetType });
        }
    }, [item]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            tagSelectRef.current?.focus?.();
        }, 120);

        return () => window.clearTimeout(timer);
    }, [item?.id]);

    const handleSave = () => {
        if (!formData.tag_id || !formData.widgetType || !formData.page) {
            setError('Не все обязательные поля заполнены.');
            return;
        }

        const normalizedWidgetType =
            formData.widgetType === 'compact' || formData.widgetType === 'card'
                ? 'number'
                : formData.widgetType;

        // Автоматически определяем displayType на основе типа страницы
        const displayType: 'widget' | 'compact' | 'card' = formData.page.startsWith('MAIN_') ? 'compact' : 'widget';
        const widgetData: LayoutItem = {
            ...formData,
            widgetType: normalizedWidgetType,
            displayType
        };

        console.log('Сохранение виджета:', widgetData);
        setError('');
        onSave(widgetData);
    };

    const labelClassName = 'font-semibold mb-2 block app-field-label';

    return (
        <div className="widget-form">
            {error && <Message severity="error" text={error} className="mb-3" />}
            
            <div className="field mt-3">
                <label className={labelClassName}>Тег</label>
                <Dropdown
                    ref={tagSelectRef}
                    value={formData.tag_id}
                    onChange={(e) => setFormData({ ...formData, tag_id: e.value })}
                    options={tags.map((tag) => ({ label: `${tag.name} (${tag.id})`, value: tag.id }))}
                    placeholder="Выберите тег"
                    className="w-full app-input"
                    filter
                />
            </div>

            <div className="field mt-3">
                <label className={labelClassName}>Страница размещения</label>
                <Dropdown
                    value={formData.page}
                    onChange={(e) => setFormData({ ...formData, page: e.value })}
                    options={availablePages}
                    optionLabel="label"
                    optionValue="value"
                    placeholder="Выберите страницу"
                    className="w-full app-input"
                />
                <small style={{ color: 'var(--text-secondary)' }}>
                    {formData.page.startsWith('MAIN_') 
                        ? 'Виджет будет отображаться компактно на главной странице'
                        : 'Виджет будет отображаться полноценно на странице оборудования'}
                </small>
            </div>

            <div className="field mt-3">
                <label className={labelClassName}>Тип отображения</label>
                <div className="display-type-info">
                    {formData.page.startsWith('MAIN_') ? (
                        <div className="display-type-badge main-page">
                            <i className="pi pi-th-large"></i>
                            <span>Компактный вид на главной</span>
                        </div>
                    ) : (
                        <div className="display-type-badge widget-page">
                            <i className="pi pi-desktop"></i>
                            <span>Полноценный виджет</span>
                        </div>
                    )}
                </div>
            </div>

            <div className="field mt-3">
                <label className={labelClassName}>Тип виджета</label>
                <Dropdown
                    value={formData.widgetType}
                    onChange={(e) => setFormData({ ...formData, widgetType: e.value })}
                    options={WIDGET_TYPES}
                    optionLabel="label"
                    optionValue="value"
                    className="w-full app-input"
                />
            </div>

            <div className="field mt-3">
                <label className={labelClassName}>
                    Пользовательская метка (опционально)
                </label>
                <InputText
                    value={formData.customLabel || ''}
                    onChange={(e) => setFormData({ ...formData, customLabel: e.target.value })}
                    placeholder="Введите метку для виджета"
                    className="app-input w-full"
                />
            </div>

            <div className="form-actions mt-4">
                <AppButton 
                    label="Сохранить" 
                    icon="pi pi-check" 
                    onClick={handleSave}
                />
                <AppButton 
                    label="Отмена" 
                    icon="pi pi-times" 
                    className="p-button-secondary" 
                    onClick={onCancel} 
                    variant="secondary"
                />
            </div>
        </div>
    );
};

export default function TagLayoutConstructor({ title }: Props) {
    const queryClient = useQueryClient();
    const toast = useAppToast();
    const [layouts, setLayouts] = useState<LayoutItem[]>([]);
    const [selectedEdge, setSelectedEdge] = useState<string>('');
    const [selectedEdgePath, setSelectedEdgePath] = useState<Edge[]>([]);
    const [selectedPage, setSelectedPage] = useState<string>('');
    const [showForm, setShowForm] = useState(false);
    const [editingItem, setEditingItem] = useState<LayoutItem | null>(null);
    const [childEdges, setChildEdges] = useState<Edge[]>([]);
    const [globalSearch, setGlobalSearch] = useState('');
    const debouncedSearch = useDebouncedValue(globalSearch, 250);
    const [showBulkPlaceDialog, setShowBulkPlaceDialog] = useState(false);
    const [bulkPlaceWidgetType, setBulkPlaceWidgetType] = useState<'gauge' | 'bar' | 'number' | 'value' | 'status' | 'alarm'>('gauge');
    const [bulkPlacing, setBulkPlacing] = useState(false);
    
    const layoutsRef = useRef<LayoutItem[]>([]);
    
    useEffect(() => {
        layoutsRef.current = layouts;
    }, [layouts]);

    // Загрузка данных
    const { data: tags } = useQuery({
        queryKey: ['tags'],
        queryFn: getTagsForAdmin
    });

    // Загрузка конфигураций виджетов
    const { data: customizations } = useQuery({
        queryKey: ['tag-customization-layout'],
        queryFn: getAllWidgetConfigs,
        refetchOnWindowFocus: false
    });

    const sortedTags = useMemo(() => {
        if (!tags) return [];
        return sortTagsByName(tags);
    }, [tags]);

    const tagsMap = useMemo(() => {
        if (!sortedTags) return new Map();
        return new Map(sortedTags.map(tag => [tag.id, tag.name]));
    }, [sortedTags]);

    const filteredTags = useMemo(() => {
        return getFilteredAndSortedTags(sortedTags || [], selectedEdge);
    }, [sortedTags, selectedEdge]);

    // Загрузка дочерних элементов выбранного edge
    useEffect(() => {
        if (selectedEdge) {
            getEdgeChildren(selectedEdge).then(children => {
                setChildEdges(children);
            }).catch(() => {
                setChildEdges([]);
            });
        } else {
            setChildEdges([]);
        }
    }, [selectedEdge]);

    // Автоматически выбираем страницу при выборе edge
    useEffect(() => {
        if (selectedEdge && selectedEdgePath.length > 0) {
            // По умолчанию выбираем страницу оборудования для выбранного edge
            setSelectedPage(selectedEdge);
        }
    }, [selectedEdge, selectedEdgePath]);

    // Преобразование существующих кастомизаций в layout
    useEffect(() => {
        if (!customizations || !Array.isArray(customizations)) return;

        const layoutItems: LayoutItem[] = [];
        
        customizations.forEach((config: any) => {
            // Проверяем, есть ли необходимые поля
            if (config.edge_id && config.tag_id && config.config) {
                try {
                    // Парсим конфигурацию, если она в формате JSON
                    const widgetConfig = typeof config.config === 'string' 
                        ? JSON.parse(config.config) 
                        : config.config;
                    
                    layoutItems.push({
                        id: `${config.edge_id}-${config.tag_id}-${widgetConfig.page}`,
                        edge_id: config.edge_id,
                        tag_id: config.tag_id,
                        ...widgetConfig
                    });
                } catch (error) {
                    console.error('Ошибка парсинга конфигурации:', error);
                }
            }
        });

        console.log('Загружено виджетов:', layoutItems.length);
        setLayouts(layoutItems);
        layoutsRef.current = layoutItems;
    }, [customizations]);

    // Мутация для сохранения одного виджета
    const saveSingleMutation = useMutation({
        mutationFn: async (item: LayoutItem) => {
            console.log('Сохранение одного виджета:', item);
            
            // Удаляем старую кастомизацию, если она есть
            try {
                await deleteTagCustomization(item.edge_id, item.tag_id, 'widgetConfig');
            } catch (error) {
                // Игнорируем ошибку, если записи не было
            }

            const { edge_id, tag_id, id, ...config } = item;
            
            return createTagCustomization({
                edge_id: item.edge_id,
                tag_id: item.tag_id,
                key: 'widgetConfig',
                value: JSON.stringify(config)
            });
        },
        onSuccess: () => {
            console.log('Успешное сохранение одного виджета');
            queryClient.invalidateQueries({ queryKey: ['tag-customization-layout'] });
        },
        onError: (error) => {
            console.error('Ошибка сохранения одного виджета:', error);
        }
    });

    const handleDrop = useCallback((draggedItem: any, position: { x: number; y: number }) => {
        const constrainedPosition = {
            x: Math.max(10, Math.min(position.x, 1500)),
            y: Math.max(10, Math.min(position.y, 600))
        };
        
        const updatedLayouts = layoutsRef.current.map(item =>
            item.id === draggedItem.id
                ? { ...item, position: constrainedPosition }
                : item
        );
        
        setLayouts(updatedLayouts);
        
        const changedWidget = updatedLayouts.find(item => item.id === draggedItem.id);
        if (changedWidget) {
            saveSingleMutation.mutate(changedWidget);
        }
    }, [saveSingleMutation]);

    const handleEdgeSelect = (edgeId: string, edgePath: Edge[]) => {
        console.log('Выбран edge:', edgeId, 'Путь:', edgePath);
        setSelectedEdge(edgeId);
        setSelectedEdgePath(edgePath);
    };

    const handleAddWidget = () => {
        if (!selectedEdge) {
            toast.warn('Сначала выберите элемент в дереве.');
            return;
        }
        if (filteredTags.length === 0) {
            toast.warn('Для выбранного блока нет привязанных тегов.');
            return;
        }

        setEditingItem({
            id: `new-${Date.now()}`,
            edge_id: selectedEdge,
            tag_id: filteredTags[0]?.id || '',
            page: selectedPage,
            widgetType: 'gauge',
            position: { x: 50, y: 50 },
            displayType: selectedPage.startsWith('MAIN_') ? 'compact' : 'widget'
        });
        setShowForm(true);
    };

    const handlePlaceAllTagsOnPage = () => {
        if (!selectedEdge || !selectedPage) {
            toast.warn('Сначала выберите элемент в дереве и страницу размещения.');
            return;
        }
        if (filteredTags.length === 0) {
            toast.warn('Для выбранного элемента нет доступных тегов (список пуст).');
            return;
        }
        setShowBulkPlaceDialog(true);
    };

    const executeBulkPlaceAllTags = async () => {
        if (!selectedEdge || !selectedPage || filteredTags.length === 0) return;

        const tagIds = new Set(filteredTags.map((t) => t.id));
        const COL = 260;
        const ROW = 260;
        const baseLayouts = layoutsRef.current.filter(
            (item) => !(item.edge_id === selectedEdge && tagIds.has(item.tag_id))
        );
        const newItems: LayoutItem[] = filteredTags.map((tag, index) => {
            const col = index % 4;
            const row = Math.floor(index / 4);
            return {
                id: `${selectedEdge}-${tag.id}-${selectedPage}`,
                edge_id: selectedEdge,
                tag_id: tag.id,
                page: selectedPage,
                widgetType: bulkPlaceWidgetType,
                position: { x: 20 + col * COL, y: 20 + row * ROW },
                displayType: selectedPage.startsWith('MAIN_') ? 'compact' : 'widget',
            };
        });

        setBulkPlacing(true);
        setLayouts([...baseLayouts, ...newItems]);
        try {
            for (const item of newItems) {
                try {
                    await saveSingleMutation.mutateAsync(item);
                } catch (e) {
                    console.error('Ошибка сохранения виджета', item.tag_id, e);
                }
            }
            setShowBulkPlaceDialog(false);
        } finally {
            setBulkPlacing(false);
        }
    };

    const handleEditWidget = (item: LayoutItem) => {
        setEditingItem(item);
        setShowForm(true);
    };

    const handleSaveWidget = (item: LayoutItem) => {
        const existingIndex = layoutsRef.current.findIndex(l => l.id === item.id);
        let newLayouts: LayoutItem[];

        if (existingIndex >= 0) {
            newLayouts = [...layoutsRef.current];
            newLayouts[existingIndex] = item;
        } else {
            newLayouts = [...layoutsRef.current, { 
                ...item, 
                id: `${item.edge_id}-${item.tag_id}-${item.page}` 
            }];
        }

        console.log('Saving widget:', item);
        setLayouts(newLayouts);
        saveSingleMutation.mutate(item);
        setShowForm(false);
        setEditingItem(null);
    };

    const handleDeleteWidget = (id: string) => {
        confirmDialog({
            message: 'Вы уверены, что хотите удалить этот виджет?',
            header: 'Подтверждение удаления',
            icon: 'pi pi-exclamation-triangle',
            acceptClassName: 'p-button-danger',
            accept: () => {
                const widgetToDelete = layoutsRef.current.find(item => item.id === id);
                const newLayouts = layoutsRef.current.filter(item => item.id !== id);
                
                console.log('Deleting widget:', id);
                setLayouts(newLayouts);
                
                if (widgetToDelete) {
                    deleteTagCustomization(widgetToDelete.edge_id, widgetToDelete.tag_id, 'widgetConfig')
                        .catch(() => {});
                }
            },
        });
    };

    const handleRefresh = () => {
        console.log('Refreshing data from server');
        queryClient.invalidateQueries({ queryKey: ['tag-customization-layout'] });
    };

    const pageLayouts = useMemo(() => {
        if (!selectedPage) return [];
        
        return layouts.filter(item => 
            item.page === selectedPage
        ).filter(item => {
            if (debouncedSearch) {
                const tagName = tagsMap.get(item.tag_id) || '';
                const widgetLabel = item.customLabel || '';
                const normalized = debouncedSearch.toLowerCase();
                return tagName.toLowerCase().includes(normalized) ||
                       widgetLabel.toLowerCase().includes(normalized);
            }
            return true;
        });
    }, [layouts, selectedPage, debouncedSearch, tagsMap]);

    const availablePages = useMemo(() => {
        return getAvailablePages(selectedEdge, selectedEdgePath);
    }, [selectedEdge, selectedEdgePath]);

    const selectedPageName = useMemo(() => {
        const page = availablePages.find(p => p.value === selectedPage);
        return page ? page.label : `Страница ${selectedPage}`;
    }, [selectedPage, availablePages]);

    const pageType = useMemo(() => {
        if (selectedPage.startsWith('MAIN_')) return 'main';
        return 'widget';
    }, [selectedPage]);

    return (
        <DndProvider backend={HTML5Backend}>
            <div className="layout-constructor">
                <PageHeader
                    kicker="Конструктор"
                    title={title}
                    description="Настройте размещение виджетов на выбранной странице оборудования. Поддерживается drag-and-drop и автосохранение."
                    actions={(
                        <>
                            <div className="p-input-icon-left">
                                <i className="pi pi-search" />
                                <input
                                    type="text"
                                    value={globalSearch}
                                    onChange={(e) => setGlobalSearch(e.target.value)}
                                    placeholder="Поиск по виджетам..."
                                    className="p-inputtext mr-2 app-input"
                                />
                            </div>
                            {selectedEdge ? (
                                <>
                                    <Dropdown
                                        value={selectedPage}
                                        onChange={(e) => setSelectedPage(e.value)}
                                        options={availablePages}
                                        optionLabel="label"
                                        optionValue="value"
                                        placeholder="Страница"
                                        className="mr-2 app-input"
                                    />
                                    <AppButton
                                        label="Добавить виджет"
                                        icon="pi pi-plus"
                                        onClick={handleAddWidget}
                                        className="mr-2"
                                    />
                                    <Button
                                        label="Разместить все теги"
                                        icon="pi pi-objects-column"
                                        onClick={handlePlaceAllTagsOnPage}
                                        disabled={filteredTags.length === 0 || saveSingleMutation.isPending || bulkPlacing}
                                        severity="secondary"
                                        className="mr-2"
                                        title="Создать виджеты для всех тегов из списка (доступных для элемента) на текущей странице с сеткой позиций"
                                    />
                                </>
                            ) : null}
                            <Button label="Обновить" icon="pi pi-refresh" onClick={handleRefresh} severity="info" />
                        </>
                    )}
                />

                {(saveSingleMutation.error) && (
                    <Message severity="error" text={`Ошибка сохранения: ${getErrorMessage(saveSingleMutation.error, 'Произошла ошибка при сохранении')}`} />
                )}

                {(saveSingleMutation.isPending) && (
                    <Message severity="info" text="Сохранение..." />
                )}

                <div className="constructor-content-grid">
                    {/* Левая колонка: дерево edge */}
                    <div className="tree-column">
                        <EdgeTreeSelector
                            selectedEdgeId={selectedEdge}
                            onSelectEdge={handleEdgeSelect}
                        />
                        
                        {selectedEdge && childEdges.length > 0 && (
                            <div className="selection-info mt-4">
                                <div className="selected-edge-info">
                                    <h4>Выбрано: {selectedEdgePath[selectedEdgePath.length - 1]?.name || selectedEdge}</h4>
                                    <p className="text-sm">Дочерних элементов: {childEdges.length}</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Правая колонка: конструктор виджетов */}
                    <div className="widget-column">
                        {selectedEdge ? (
                            <>
                                <EdgePathDisplay edgePath={selectedEdgePath} />
                                
                                <div className="page-info mb-3">
                                    <h3>Конструктор виджетов</h3>
                                    <div className="page-stats">
                                        <span className="stat-item">
                                            <i className="pi pi-tags"></i>
                                            Виджетов на странице: {pageLayouts.length}
                                        </span>
                                        <span className="stat-item">
                                            <i className="pi pi-sitemap"></i>
                                            Тип страницы: {pageType === 'main' ? 'Главная' : 'Оборудование'}
                                        </span>
                                    </div>
                                </div>

                                <DropZone 
                                    page={selectedPage} 
                                    pageName={selectedPageName}
                                    pageType={pageType}
                                    onDrop={handleDrop}
                                >
                                    {pageLayouts.map(item => (
                                        <DraggableWidget
                                            key={item.id}
                                            item={item}
                                            tagName={tagsMap.get(item.tag_id) || `Тег ${item.tag_id}`}
                                            onEdit={handleEditWidget}
                                            onDelete={handleDeleteWidget}
                                        />
                                    ))}
                                    {pageLayouts.length === 0 && (
                                        <div className="empty-state">
                                            <i className="pi pi-inbox" style={{ fontSize: '3rem' }}></i>
                                            <p>Перетащите виджеты сюда или нажмите "Добавить виджет"</p>
                                            <p className="text-sm">
                                                {selectedPage 
                                                    ? `На странице "${selectedPageName}" пока нет виджетов` 
                                                    : 'Выберите страницу для отображения виджетов'}
                                            </p>
                                        </div>
                                    )}
                                </DropZone>
                            </>
                        ) : (
                            <div className="no-selection-message">
                                <i className="pi pi-sitemap" style={{ fontSize: '4rem' }}></i>
                                <h3>Выберите элемент в дереве</h3>
                                <p>Для начала работы выберите элемент из иерархии оборудования слева</p>
                            </div>
                        )}
                    </div>
                </div>

                <Dialog
                    visible={showForm}
                    className="responsive-dialog responsive-dialog-md p-fluid admin-dialog"
                    header={editingItem?.id.startsWith('new') ? 'Добавить виджет' : 'Редактировать виджет'}
                    modal
                    onHide={() => {
                        setShowForm(false);
                        setEditingItem(null);
                    }}
                >
                    <WidgetForm
                        item={editingItem}
                        tags={filteredTags}
                        availablePages={availablePages}
                        onSave={handleSaveWidget}
                        onCancel={() => {
                            setShowForm(false);
                            setEditingItem(null);
                        }}
                    />
                </Dialog>

                <Dialog
                    visible={showBulkPlaceDialog}
                    className="responsive-dialog responsive-dialog-md p-fluid admin-dialog"
                    header="Массовое размещение виджетов"
                    modal
                    draggable={false}
                    onHide={() => {
                        if (!bulkPlacing) {
                            setShowBulkPlaceDialog(false);
                        }
                    }}
                >
                    <p className="mb-3" style={{ color: 'var(--text-secondary)' }}>
                        Будет создано или обновлено <strong>{filteredTags.length}</strong> виджетов на странице
                        «{selectedPageName}». Выбранный тип будет применён ко всем тегам из списка. У каждого тега для
                        этого элемента допускается одна конфигурация — при необходимости она будет перезаписана.
                    </p>
                    <div className="field">
                        <label className="font-semibold mb-2 block" htmlFor="bulk-place-widget-type" style={{ color: 'var(--text-primary)' }}>
                            Тип виджета для всех
                        </label>
                        <Dropdown
                            inputId="bulk-place-widget-type"
                            value={bulkPlaceWidgetType}
                            options={WIDGET_TYPES}
                            onChange={(e) =>
                                setBulkPlaceWidgetType(
                                    e.value as 'gauge' | 'bar' | 'number' | 'value' | 'status' | 'alarm'
                                )
                            }
                            optionLabel="label"
                            optionValue="value"
                            className="w-full"
                            disabled={bulkPlacing}
                        />
                    </div>
                    <div className="form-actions mt-4 flex gap-2 justify-content-end">
                        <Button
                            type="button"
                            label="Отмена"
                            className="p-button-secondary"
                            onClick={() => setShowBulkPlaceDialog(false)}
                            disabled={bulkPlacing}
                        />
                        <AppButton
                            type="button"
                            label="Разместить"
                            icon="pi pi-check"
                            onClick={() => void executeBulkPlaceAllTags()}
                            loading={bulkPlacing}
                            disabled={bulkPlacing}
                        />
                    </div>
                </Dialog>

                <ConfirmDialog />
            </div>
        </DndProvider>
    );
}
