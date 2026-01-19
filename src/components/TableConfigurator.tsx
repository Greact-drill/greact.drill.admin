import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
    getTableConfigByPage,
    getAllTableConfigs,
    createTableConfig,
    updateTableConfig,
    deleteTableConfig,
    getEdgeChildren,
    getTagsForAdmin,
    getEdgesForAdmin,
    type Edge,
    type Tag,
    type TableConfig,
    type TableCell
} from '../api/admin';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { Message } from 'primereact/message';
import { InputText } from 'primereact/inputtext';
import { InputNumber } from 'primereact/inputnumber';
import EdgeTreeSelector from './EdgeTreeSelector';
import EdgePathDisplay from './EdgePathDisplay';
import { getErrorMessage } from '../utils/errorUtils';

interface Props {
    title: string;
}

// Генерация доступных страниц на основе выбранного edge
const getAvailablePages = (selectedEdge: string, edgePath: Edge[]): Array<{label: string, value: string}> => {
    const pages: Array<{label: string, value: string}> = [];
    
    // 1. Главная страница буровой
    if (edgePath.length > 0) {
        const rootEdge = edgePath[0];
        pages.push({ 
            label: `Главная страница (${rootEdge.name})`, 
            value: `MAIN_${rootEdge.id}` 
        });
    }
    
    // 2. Страница выбранного edge
    pages.push({ 
        label: `Страница оборудования (${edgePath[edgePath.length - 1]?.name || selectedEdge})`, 
        value: selectedEdge 
    });
    
    // 3. Родительские страницы (если есть)
    edgePath.forEach((edge, index) => {
        if (index < edgePath.length - 1) {
            pages.push({ 
                label: `Родительская: ${edge.name}`, 
                value: edge.id 
            });
        }
    });
    
    return pages;
};

export default function TableConfigurator({ title }: Props) {
    const queryClient = useQueryClient();
    const [selectedEdge, setSelectedEdge] = useState<string>('');
    const [selectedEdgePath, setSelectedEdgePath] = useState<Edge[]>([]);
    const [selectedPage, setSelectedPage] = useState<string>('');
    const [showConfigDialog, setShowConfigDialog] = useState(false);
    const [tableConfig, setTableConfig] = useState<TableConfig | null>(null);
    
    // Загрузка данных
    const { data: tags } = useQuery({
        queryKey: ['tags'],
        queryFn: getTagsForAdmin
    });

    const { data: edges } = useQuery({
        queryKey: ['edges'],
        queryFn: getEdgesForAdmin
    });

    const { data: tableConfigs } = useQuery({
        queryKey: ['table-configs'],
        queryFn: getAllTableConfigs,
        refetchOnWindowFocus: false
    });

    // Загрузка конфигурации таблицы для выбранной страницы
    const { data: currentTableConfig, refetch: refetchTableConfig } = useQuery({
        queryKey: ['table-config', selectedPage],
        queryFn: () => getTableConfigByPage(selectedPage),
        enabled: !!selectedPage,
        refetchOnWindowFocus: false
    });

    // Загрузка дочерних элементов выбранного edge
    useEffect(() => {
        if (selectedEdge) {
            getEdgeChildren(selectedEdge).then(children => {
                // Не нужно сохранять children
            }).catch(() => {
                // Игнорируем ошибку
            });
        }
    }, [selectedEdge]);

    // Автоматически выбираем страницу при выборе edge
    useEffect(() => {
        if (selectedEdge && selectedEdgePath.length > 0) {
            setSelectedPage(selectedEdge);
        }
    }, [selectedEdge, selectedEdgePath]);

    // Загрузка конфигурации при выборе страницы
    useEffect(() => {
        if (selectedPage && currentTableConfig) {
            setTableConfig({
                page: currentTableConfig.page,
                title: currentTableConfig.title || '',
                rows: currentTableConfig.rows || 5,
                cols: currentTableConfig.cols || 5,
                rowHeaders: currentTableConfig.rowHeaders || [],
                colHeaders: currentTableConfig.colHeaders || [],
                cells: currentTableConfig.cells || []
            });
        } else if (selectedPage) {
            // Инициализируем пустую конфигурацию
            setTableConfig({
                page: selectedPage,
                title: '',
                rows: 5,
                cols: 5,
                rowHeaders: [],
                colHeaders: [],
                cells: []
            });
        }
    }, [selectedPage, currentTableConfig]);

    // Мутация для сохранения таблицы
    const saveTableMutation = useMutation({
        mutationFn: async (config: TableConfig) => {
            if (currentTableConfig) {
                return updateTableConfig(config.page, config);
            } else {
                return createTableConfig(config.page, config);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['table-configs'] });
            queryClient.invalidateQueries({ queryKey: ['table-config', selectedPage] });
            setShowConfigDialog(false);
        },
        onError: (error) => {
            console.error('Ошибка сохранения таблицы:', error);
        }
    });

    // Мутация для удаления таблицы
    const deleteTableMutation = useMutation({
        mutationFn: async (page: string) => {
            return deleteTableConfig(page);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['table-configs'] });
            queryClient.invalidateQueries({ queryKey: ['table-config', selectedPage] });
            setTableConfig(null);
        }
    });

    const handleEdgeSelect = (edgeId: string, edgePath: Edge[]) => {
        setSelectedEdge(edgeId);
        setSelectedEdgePath(edgePath);
    };

    const handleAddTable = () => {
        if (!selectedPage) {
            alert('Сначала выберите страницу');
            return;
        }

        setTableConfig({
            page: selectedPage,
            title: '',
            rows: 5,
            cols: 5,
            rowHeaders: [],
            colHeaders: [],
            cells: []
        });
        setShowConfigDialog(true);
    };

    const handleEditTable = () => {
        if (tableConfig) {
            setShowConfigDialog(true);
        }
    };

    const handleDeleteTable = () => {
        if (!selectedPage) return;

        confirmDialog({
            message: 'Вы уверены, что хотите удалить эту таблицу?',
            header: 'Подтверждение удаления',
            icon: 'pi pi-exclamation-triangle',
            acceptClassName: 'p-button-danger',
            accept: () => {
                deleteTableMutation.mutate(selectedPage);
            },
        });
    };

    const handleSaveTable = () => {
        if (!tableConfig) return;

        // Валидация
        if (tableConfig.rows < 1 || tableConfig.cols < 1) {
            alert('Количество строк и столбцов должно быть больше 0');
            return;
        }

        saveTableMutation.mutate(tableConfig);
    };

    const availablePages = useMemo(() => {
        return getAvailablePages(selectedEdge, selectedEdgePath);
    }, [selectedEdge, selectedEdgePath]);

    const selectedPageName = useMemo(() => {
        const page = availablePages.find(p => p.value === selectedPage);
        return page ? page.label : `Страница ${selectedPage}`;
    }, [selectedPage, availablePages]);

    const inputStyle = { backgroundColor: 'var(--card-bg)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' };
    const labelStyle = { color: 'var(--text-primary)' };

    return (
        <div className="table-configurator">
            <div className="configurator-header">
                <h2>{title}</h2>
                <div className="controls">
                    {selectedPage && (
                        <>
                            {tableConfig && tableConfig.rows > 0 && tableConfig.cols > 0 && (
                                <Button
                                    label="Редактировать таблицу"
                                    icon="pi pi-pencil"
                                    onClick={handleEditTable}
                                    className="mr-2"
                                    style={{backgroundColor: 'var(--accent-primary)', borderColor: 'var(--accent-primary)'}}
                                />
                            )}
                            {!tableConfig || tableConfig.rows === 0 || tableConfig.cols === 0 ? (
                                <Button
                                    label="Добавить таблицу"
                                    icon="pi pi-plus"
                                    onClick={handleAddTable}
                                    style={{backgroundColor: 'var(--accent-primary)', borderColor: 'var(--accent-primary)'}}
                                    className="mr-2"
                                />
                            ) : (
                                <Button
                                    label="Удалить таблицу"
                                    icon="pi pi-trash"
                                    onClick={handleDeleteTable}
                                    severity="danger"
                                    className="mr-2"
                                />
                            )}
                        </>
                    )}
                    <Button
                        label="Обновить"
                        icon="pi pi-refresh"
                        onClick={() => {
                            queryClient.invalidateQueries({ queryKey: ['table-configs'] });
                            refetchTableConfig();
                        }}
                        severity="info"
                    />
                </div>
            </div>

            {(saveTableMutation.error || deleteTableMutation.error) && (
                <Message 
                    severity="error" 
                    text={`Ошибка: ${getErrorMessage(saveTableMutation.error || deleteTableMutation.error, 'Произошла ошибка')}`} 
                />
            )}

            {(saveTableMutation.isPending || deleteTableMutation.isPending) && (
                <Message severity="info" text="Сохранение..." />
            )}

            <div className="configurator-content-grid">
                {/* Левая колонка: дерево edge */}
                <div className="tree-column">
                    <EdgeTreeSelector
                        selectedEdgeId={selectedEdge}
                        onSelectEdge={handleEdgeSelect}
                    />
                </div>

                {/* Правая колонка: настройка таблицы */}
                <div className="config-column">
                    {selectedEdge ? (
                        <>
                            <EdgePathDisplay edgePath={selectedEdgePath} />
                            
                            <div className="page-selector mb-3">
                                <label className="font-semibold mb-2 block" style={labelStyle}>Страница</label>
                                <select
                                    value={selectedPage}
                                    onChange={(e) => setSelectedPage(e.target.value)}
                                    className="p-dropdown w-full"
                                    style={inputStyle}
                                >
                                    <option value="">Выберите страницу</option>
                                    {availablePages.map(page => (
                                        <option key={page.value} value={page.value}>
                                            {page.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {selectedPage && (
                                <div className="table-info">
                                    <h3>Конфигурация таблицы</h3>
                                    {tableConfig && tableConfig.rows > 0 && tableConfig.cols > 0 ? (
                                        <div className="table-summary">
                                            <p><strong>Заголовок:</strong> {tableConfig.title || 'Не указан'}</p>
                                            <p><strong>Размер:</strong> {tableConfig.rows} строк × {tableConfig.cols} столбцов</p>
                                        </div>
                                    ) : (
                                        <div className="empty-state">
                                            <i className="pi pi-table" style={{ fontSize: '3rem' }}></i>
                                            <p>На этой странице нет настроенной таблицы</p>
                                            <p className="text-sm">Нажмите "Добавить таблицу" для создания</p>
                                        </div>
                                    )}
                                </div>
                            )}
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

            {/* Диалог настройки таблицы */}
            <Dialog
                visible={showConfigDialog}
                style={{ width: '95vw', maxWidth: '1600px' }}
                header={currentTableConfig ? 'Редактировать таблицу' : 'Добавить таблицу'}
                modal
                className="p-fluid admin-dialog"
                onHide={() => {
                    setShowConfigDialog(false);
                    // Восстанавливаем конфигурацию из сервера при отмене
                    if (currentTableConfig) {
                        setTableConfig({
                            page: currentTableConfig.page,
                            title: currentTableConfig.title || '',
                            rows: currentTableConfig.rows || 5,
                            cols: currentTableConfig.cols || 5,
                            rowHeaders: currentTableConfig.rowHeaders || [],
                            colHeaders: currentTableConfig.colHeaders || [],
                            cells: currentTableConfig.cells || []
                        });
                    }
                }}
            >
                {tableConfig && (
                    <TableConfigForm
                        config={tableConfig}
                        tags={tags || []}
                        onConfigChange={setTableConfig}
                        onSave={handleSaveTable}
                        onCancel={() => setShowConfigDialog(false)}
                        isLoading={saveTableMutation.isPending}
                    />
                )}
            </Dialog>

            <ConfirmDialog />
        </div>
    );
}

// Компонент формы настройки таблицы
interface TableConfigFormProps {
    config: TableConfig;
    tags: Tag[];
    onConfigChange: React.Dispatch<React.SetStateAction<TableConfig | null>>;
    onSave: () => void;
    onCancel: () => void;
    isLoading: boolean;
}

type CellType = 'text' | 'tag-number' | 'tag-text';

interface CellEditorProps {
    rowIndex: number;
    colIndex: number;
    cell: TableCell;
    tags: Tag[];
    tagNameById: Map<string, string>;
    cellInputStyle: React.CSSProperties;
    cellSelectStyle: React.CSSProperties;
    isActive: boolean;
    onActivate: (row: number, col: number) => void;
    onDeactivate: () => void;
    onTypeChange: (row: number, col: number, type: CellType) => void;
    onValueChange: (row: number, col: number, value: string) => void;
}

const CellEditor = React.memo(function CellEditor({
    rowIndex,
    colIndex,
    cell,
    tags,
    tagNameById,
    cellInputStyle,
    cellSelectStyle,
    isActive,
    onActivate,
    onDeactivate,
    onTypeChange,
    onValueChange
}: CellEditorProps) {
    const selectedTagLabel =
        cell.value && tagNameById.has(cell.value) ? `${tagNameById.get(cell.value)} (${cell.value})` : cell.value || '';

    return (
        <div className="table-cell-editor">
            <div className="table-cell-type-toggle">
                <button
                    type="button"
                    className={`table-cell-type-button ${cell.type === 'text' ? 'is-active' : ''}`}
                    onClick={() => onTypeChange(rowIndex, colIndex, 'text')}
                >
                    Текст
                </button>
                <button
                    type="button"
                    className={`table-cell-type-button ${cell.type === 'tag-number' ? 'is-active' : ''}`}
                    onClick={() => onTypeChange(rowIndex, colIndex, 'tag-number')}
                >
                    Тег №
                </button>
                <button
                    type="button"
                    className={`table-cell-type-button ${cell.type === 'tag-text' ? 'is-active' : ''}`}
                    onClick={() => onTypeChange(rowIndex, colIndex, 'tag-text')}
                >
                    Тег текст
                </button>
            </div>
            {cell.type === 'text' ? (
                <InputText
                    value={cell.value || ''}
                    onChange={(e) => onValueChange(rowIndex, colIndex, e.target.value)}
                    placeholder="Введите текст"
                    style={cellInputStyle}
                />
            ) : (
                <select
                    value={cell.value || ''}
                    onChange={(e) => onValueChange(rowIndex, colIndex, e.target.value)}
                    style={cellSelectStyle}
                    onFocus={() => onActivate(rowIndex, colIndex)}
                    onBlur={onDeactivate}
                >
                    {isActive ? (
                        <>
                            <option value="">Выберите тег</option>
                            {tags.map(tag => (
                                <option key={tag.id} value={tag.id}>
                                    {tag.name} ({tag.id})
                                </option>
                            ))}
                        </>
                    ) : (
                        <option value={cell.value || ''}>
                            {selectedTagLabel || 'Выберите тег'}
                        </option>
                    )}
                </select>
            )}
        </div>
    );
});

function TableConfigForm({ config, tags, onConfigChange, onSave, onCancel, isLoading }: TableConfigFormProps) {
    const inputStyle = useMemo(
        () => ({ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }),
        []
    );
    const labelStyle = useMemo(() => ({ color: 'var(--text-primary)' }), []);
    const emptyCell = useMemo<TableCell>(() => ({ type: 'text', value: '' }), []);
    const cellInputStyle = useMemo(
        () => ({ ...inputStyle, fontSize: '12px', padding: '4px 8px', width: '100%' }),
        [inputStyle]
    );
    const cellSelectStyle = cellInputStyle;
    const tagNameById = useMemo(() => {
        const map = new Map<string, string>();
        tags.forEach((tag) => map.set(tag.id, tag.name));
        return map;
    }, [tags]);
    const [activeCell, setActiveCell] = useState<{ row: number; col: number } | null>(null);
    const totalCells = config.rows * config.cols;

    const updateConfig = useCallback(
        (updater: (prev: TableConfig) => TableConfig) => {
            onConfigChange((prev) => (prev ? updater(prev) : prev));
        },
        [onConfigChange]
    );

    // Инициализация cells при изменении размеров
    useEffect(() => {
        const currentRows = config.cells?.length || 0;
        const currentCols = config.cells?.[0]?.length || 0;

        // Проверяем, нужно ли изменять размеры
        if (currentRows !== config.rows || currentCols !== config.cols) {
            const newCells: TableCell[][] = [];
            for (let row = 0; row < config.rows; row++) {
                const rowCells: TableCell[] = [];
                for (let col = 0; col < config.cols; col++) {
                    // Сохраняем существующие ячейки, если они есть
                    if (config.cells?.[row]?.[col]) {
                        rowCells.push(config.cells[row][col]);
                    } else {
                        rowCells.push({ type: 'text', value: '' });
                    }
                }
                newCells.push(rowCells);
            }

            // Инициализируем заголовки, если их нет
            const newRowHeaders = [...(config.rowHeaders || [])];
            const newColHeaders = [...(config.colHeaders || [])];

            // Дополняем заголовки до нужного размера
            while (newRowHeaders.length < config.rows) {
                newRowHeaders.push('');
            }
            while (newColHeaders.length < config.cols) {
                newColHeaders.push('');
            }
            
            // Обрезаем до нужного размера
            newRowHeaders.length = config.rows;
            newColHeaders.length = config.cols;

            updateConfig(() => ({
                ...config,
                cells: newCells,
                rowHeaders: newRowHeaders,
                colHeaders: newColHeaders
            }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [config.rows, config.cols]);

    const handleCellTypeChange = useCallback(
        (row: number, col: number, type: CellType) => {
            updateConfig((prev) => {
                const hasSizedCells = prev.cells.length === prev.rows && prev.cells[0]?.length === prev.cols;
                const baseCells = hasSizedCells
                    ? prev.cells
                    : Array.from({ length: prev.rows }, () =>
                          Array.from({ length: prev.cols }, () => ({ type: 'text', value: '' }))
                      );
                const newCells = [...baseCells];
                const newRow = [...newCells[row]];
                const currentCell = newRow[col] || emptyCell;
                const isTagType = type === 'tag-number' || type === 'tag-text';
                newRow[col] = {
                    ...currentCell,
                    type,
                    value: type === 'text' ? (currentCell.value || '') : (currentCell.tag_id || currentCell.value || ''),
                    tag_id: isTagType ? (currentCell.tag_id || currentCell.value || '') : undefined
                };
                newCells[row] = newRow;
                return { ...prev, cells: newCells };
            });
        },
        [updateConfig, emptyCell]
    );

    const handleCellValueChange = useCallback(
        (row: number, col: number, value: string) => {
            updateConfig((prev) => {
                const hasSizedCells = prev.cells.length === prev.rows && prev.cells[0]?.length === prev.cols;
                const baseCells = hasSizedCells
                    ? prev.cells
                    : Array.from({ length: prev.rows }, () =>
                          Array.from({ length: prev.cols }, () => ({ type: 'text', value: '' }))
                      );
                const newCells = [...baseCells];
                const newRow = [...newCells[row]];
                const currentCell = newRow[col] || emptyCell;
                const isTagType = currentCell.type === 'tag-number' || currentCell.type === 'tag-text';
                newRow[col] = { ...currentCell, value, tag_id: isTagType ? value : undefined };
                newCells[row] = newRow;
                return { ...prev, cells: newCells };
            });
        },
        [updateConfig, emptyCell]
    );

    const handleRowHeaderChange = useCallback(
        (index: number, value: string) => {
            updateConfig((prev) => {
                const newRowHeaders = [...(prev.rowHeaders || [])];
                newRowHeaders[index] = value;
                return { ...prev, rowHeaders: newRowHeaders };
            });
        },
        [updateConfig]
    );

    const handleColHeaderChange = useCallback(
        (index: number, value: string) => {
            updateConfig((prev) => {
                const newColHeaders = [...(prev.colHeaders || [])];
                newColHeaders[index] = value;
                return { ...prev, colHeaders: newColHeaders };
            });
        },
        [updateConfig]
    );

    const handleActivateCell = useCallback((row: number, col: number) => {
        setActiveCell({ row, col });
    }, []);

    const handleDeactivateCell = useCallback(() => {
        setActiveCell(null);
    }, []);

    return (
        <div className="table-config-form">
            <div className="table-config-form-grid">
                <div className="table-config-sidebar">
                    <div className="table-config-panel">
                        <h3 className="table-config-panel-title">Основные параметры</h3>
                        <div className="field mb-3">
                            <label className="font-semibold mb-2 block" style={labelStyle}>Заголовок таблицы (опционально)</label>
                            <InputText
                                value={config.title || ''}
                                onChange={(e) => updateConfig((prev) => ({ ...prev, title: e.target.value }))}
                                placeholder="Введите заголовок таблицы"
                                style={inputStyle}
                            />
                        </div>

                        <div className="field mb-3">
                            <div className="flex gap-3">
                                <div className="flex-1">
                                    <label className="font-semibold mb-2 block" style={labelStyle}>Строки</label>
                                    <InputNumber
                                        value={config.rows}
                                        onValueChange={(e) => {
                                            const rows = e.value ? Math.max(1, Math.min(50, e.value)) : 1;
                                            updateConfig((prev) => ({ ...prev, rows }));
                                        }}
                                        min={1}
                                        max={50}
                                        style={inputStyle}
                                        className="w-full"
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="font-semibold mb-2 block" style={labelStyle}>Столбцы</label>
                                    <InputNumber
                                        value={config.cols}
                                        onValueChange={(e) => {
                                            const cols = e.value ? Math.max(1, Math.min(50, e.value)) : 1;
                                            updateConfig((prev) => ({ ...prev, cols }));
                                        }}
                                        min={1}
                                        max={50}
                                        style={inputStyle}
                                        className="w-full"
                                    />
                                </div>
                            </div>
                            <div className="table-config-meta">
                                <span>Ячеек: {totalCells}</span>
                                <span>Тегов доступно: {tags.length}</span>
                            </div>
                        </div>
                    </div>

                    <div className="table-config-panel">
                        <h3 className="table-config-panel-title">Подсказки</h3>
                        <ul className="table-config-hints">
                            <li>Заголовки строк и столбцов фиксируются при прокрутке.</li>
                            <li>Тип «Тег» связывает ячейку с данными из списка тегов.</li>
                            <li>Для текста используйте тип «Текст» и значение по умолчанию.</li>
                        </ul>
                    </div>

                    <div className="table-config-actions">
                        <Button
                            label="Сохранить"
                            icon="pi pi-check"
                            onClick={onSave}
                            disabled={isLoading}
                            style={{backgroundColor: 'var(--accent-primary)', borderColor: 'var(--accent-primary)'}}
                        />
                        <Button
                            label="Отмена"
                            icon="pi pi-times"
                            className="p-button-secondary"
                            onClick={onCancel}
                            disabled={isLoading}
                        />
                    </div>
                </div>

                <div className="table-config-editor">
                    <div className="table-config-editor-header">
                        <div>
                            <h3 className="table-config-editor-title">Редактор таблицы</h3>
                            <p className="table-config-editor-subtitle">Настройте заголовки строк и столбцов, затем заполните ячейки.</p>
                        </div>
                        <div className="table-config-editor-meta">
                            <span>Размер: {config.rows} × {config.cols}</span>
                        </div>
                    </div>

                    <div className="table-editor-container">
                        <div className="table-editor-wrapper">
                            <table className="table-editor">
                                <thead>
                                    <tr>
                                        <th className="table-editor-corner"></th>
                                        {/* Заголовки столбцов */}
                                        {Array.from({ length: config.cols }, (_, colIndex) => (
                                            <th key={colIndex} className="table-editor-col-header">
                                                <InputText
                                                    value={config.colHeaders?.[colIndex] || ''}
                                                    onChange={(e) => handleColHeaderChange(colIndex, e.target.value)}
                                                    placeholder={`Столбец ${colIndex + 1}`}
                                                    style={{ ...inputStyle, fontSize: '12px', padding: '4px 8px' }}
                                                />
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {Array.from({ length: config.rows }, (_, rowIndex) => (
                                        <tr key={rowIndex}>
                                            {/* Заголовок строки */}
                                            <th className="table-editor-row-header">
                                                <InputText
                                                    value={config.rowHeaders?.[rowIndex] || ''}
                                                    onChange={(e) => handleRowHeaderChange(rowIndex, e.target.value)}
                                                    placeholder={`Строка ${rowIndex + 1}`}
                                                    style={{ ...inputStyle, fontSize: '12px', padding: '4px 8px' }}
                                                />
                                            </th>
                                            {/* Ячейки */}
                                            {Array.from({ length: config.cols }, (_, colIndex) => {
                                        const cell = config.cells?.[rowIndex]?.[colIndex] || emptyCell;
                                                return (
                                                    <td key={colIndex} className="table-editor-cell">
                                                <CellEditor
                                                    rowIndex={rowIndex}
                                                    colIndex={colIndex}
                                                    cell={cell}
                                                    tags={tags}
                                                    tagNameById={tagNameById}
                                                    cellInputStyle={cellInputStyle}
                                                    cellSelectStyle={cellSelectStyle}
                                                    isActive={activeCell?.row === rowIndex && activeCell?.col === colIndex}
                                                    onActivate={handleActivateCell}
                                                    onDeactivate={handleDeactivateCell}
                                                    onTypeChange={handleCellTypeChange}
                                                    onValueChange={handleCellValueChange}
                                                />
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
