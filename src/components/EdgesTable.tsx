import { 
    getEdgesForAdmin, 
    deleteEdge, 
    createEdge, 
    updateEdge, 
    type Edge 
} from '../api/admin'; 
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ProgressSpinner } from 'primereact/progressspinner';
import { InputText } from 'primereact/inputtext';
import { Message } from 'primereact/message';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { Dropdown } from 'primereact/dropdown';
import React, { useEffect, useMemo, useState } from 'react';
import { getErrorMessage } from '../utils/errorUtils';

interface Props {
    title: string;
}

interface EdgeTreeNode {
    key: string;
    data: Edge;
    children: EdgeTreeNode[];
    level: number;
    pathIds: string[];
    pathNames: string[];
    descendantsCount: number;
}

type EdgeFormMode = 'create-root' | 'create-child' | 'edit';

type ParentOption = {
    id: string;
    label: string;
};

function sortEdgesByName(left: Edge, right: Edge) {
    return left.name.localeCompare(right.name, 'ru', { sensitivity: 'base' });
}

function buildEdgeTree(flatData: Edge[]): { tree: EdgeTreeNode[]; byId: Map<string, EdgeTreeNode> } {
    if (flatData.length === 0) {
        return { tree: [], byId: new Map<string, EdgeTreeNode>() };
    }

    const sortedEdges = [...flatData].sort(sortEdgesByName);
    const byId = new Map<string, EdgeTreeNode>();
    const tree: EdgeTreeNode[] = [];

    sortedEdges.forEach((edge) => {
        byId.set(edge.id, {
            key: edge.id,
            data: edge,
            children: [],
            level: 0,
            pathIds: [edge.id],
            pathNames: [edge.name],
            descendantsCount: 0,
        });
    });

    sortedEdges.forEach((edge) => {
        const node = byId.get(edge.id);
        if (!node) {
            return;
        }

        if (edge.parent_id && byId.has(edge.parent_id)) {
            byId.get(edge.parent_id)?.children.push(node);
        } else {
            tree.push(node);
        }
    });

    const assignMeta = (nodes: EdgeTreeNode[], level = 0, parentIds: string[] = [], parentNames: string[] = []) => {
        nodes.sort((left, right) => sortEdgesByName(left.data, right.data));

        nodes.forEach((node) => {
            node.level = level;
            node.pathIds = [...parentIds, node.data.id];
            node.pathNames = [...parentNames, node.data.name];

            assignMeta(node.children, level + 1, node.pathIds, node.pathNames);
            node.descendantsCount = node.children.reduce((count, child) => count + 1 + child.descendantsCount, 0);
        });
    };

    assignMeta(tree);

    return { tree, byId };
}

function flattenTree(nodes: EdgeTreeNode[]): EdgeTreeNode[] {
    return nodes.flatMap((node) => [node, ...flattenTree(node.children)]);
}

function collectExpandedKeys(nodes: EdgeTreeNode[]): Record<string, boolean> {
    const result: Record<string, boolean> = {};

    const visit = (items: EdgeTreeNode[]) => {
        items.forEach((node) => {
            if (node.children.length > 0) {
                result[node.key] = true;
                visit(node.children);
            }
        });
    };

    visit(nodes);
    return result;
}

function filterTree(nodes: EdgeTreeNode[], filterValue: string): {
    nodes: EdgeTreeNode[];
    autoExpandedKeys: Record<string, boolean>;
    matchedIds: Set<string>;
} {
    const trimmedFilter = filterValue.trim().toLowerCase();

    if (!trimmedFilter) {
        return {
            nodes,
            autoExpandedKeys: {},
            matchedIds: new Set<string>(),
        };
    }

    const matchedIds = new Set<string>();
    const autoExpandedKeys: Record<string, boolean> = {};

    const visit = (items: EdgeTreeNode[]): EdgeTreeNode[] => {
        return items
            .map((node) => {
                const matches =
                    node.data.name.toLowerCase().includes(trimmedFilter) ||
                    node.data.id.toLowerCase().includes(trimmedFilter);
                const filteredChildren = visit(node.children);

                if (!matches && filteredChildren.length === 0) {
                    return null;
                }

                if (matches) {
                    matchedIds.add(node.key);
                }

                if (filteredChildren.length > 0) {
                    autoExpandedKeys[node.key] = true;
                }

                return {
                    ...node,
                    children: filteredChildren,
                };
            })
            .filter((node): node is EdgeTreeNode => node != null);
    };

    return {
        nodes: visit(nodes),
        autoExpandedKeys,
        matchedIds,
    };
}

function buildParentOptions(nodes: EdgeTreeNode[]): ParentOption[] {
    return flattenTree(nodes).map((node) => ({
        id: node.data.id,
        label: `${node.pathNames.join(' / ')} (${node.data.id})`,
    }));
}

function renderHighlightedText(text: string, query: string) {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
        return text;
    }

    const lowerText = text.toLowerCase();
    const lowerQuery = trimmedQuery.toLowerCase();
    const matchIndex = lowerText.indexOf(lowerQuery);

    if (matchIndex === -1) {
        return text;
    }

    const before = text.slice(0, matchIndex);
    const match = text.slice(matchIndex, matchIndex + trimmedQuery.length);
    const after = text.slice(matchIndex + trimmedQuery.length);

    return (
        <>
            {before}
            <mark>{match}</mark>
            {after}
        </>
    );
}

function getFormDialogMeta(mode: EdgeFormMode, parentEdge?: Edge | null) {
    if (mode === 'edit') {
        return {
            kicker: 'Редактирование',
            title: 'Изменение буровой',
            description: 'Обновите отображаемое имя или аккуратно перенесите элемент в другое место структуры.',
            icon: 'pi pi-pencil',
        };
    }

    if (mode === 'create-child') {
        return {
            kicker: 'Новый дочерний элемент',
            title: 'Создание дочерней буровой',
            description: `Новая буровая будет добавлена внутрь "${parentEdge?.name ?? parentEdge?.id}".`,
            icon: 'pi pi-plus-circle',
        };
    }

    return {
        kicker: 'Новая структура',
        title: 'Создание корневой буровой',
        description: 'Создайте верхнеуровневый элемент, который станет точкой входа в структуру буровых.',
        icon: 'pi pi-sitemap',
    };
}

const EdgeForm: React.FC<{ 
    mode: EdgeFormMode;
    edge?: Edge | null; 
    parentEdge?: Edge | null;
    onClose: () => void; 
    edges: Edge[];
    treeNodes: EdgeTreeNode[];
}> = ({ mode, edge, parentEdge, onClose, edges, treeNodes }) => {
    const queryClient = useQueryClient();
    const isEdit = mode === 'edit';
    const [name, setName] = useState(edge?.name || '');
    const [id, setId] = useState(edge?.id || '');
    const [parentId, setParentId] = useState(
        mode === 'create-child' ? parentEdge?.id || '' : edge?.parent_id || ''
    );
    const [error, setError] = useState('');
    const [fieldErrors, setFieldErrors] = useState<{ id?: string; name?: string }>({});

    const mutation = useMutation({
        mutationFn: (payload: { id?: string; name: string; parent_id: string | null }) =>
            isEdit
                ? updateEdge(edge!.id, payload)
                : createEdge({
                    id: payload.id as string,
                    name: payload.name,
                    parent_id: payload.parent_id || undefined,
                }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['edges'] });
            onClose();
        },
        onError: (err: any) => {
            setError(getErrorMessage(err, 'Ошибка выполнения операции.'));
        },
    });

    const allParentOptions = useMemo(() => buildParentOptions(treeNodes), [treeNodes]);

    const availableParents = useMemo(() => {
        if (!isEdit || !edge) {
            return allParentOptions;
        }

        const blockedIds = new Set<string>([edge.id]);
        const descendants = new Set<string>();
        const collectDescendants = (targetId: string) => {
            edges.forEach((candidate) => {
                if (candidate.parent_id === targetId && !descendants.has(candidate.id)) {
                    descendants.add(candidate.id);
                    collectDescendants(candidate.id);
                }
            });
        };
        collectDescendants(edge.id);
        descendants.forEach((idValue) => blockedIds.add(idValue));

        return allParentOptions.filter((option) => !blockedIds.has(option.id));
    }, [allParentOptions, edge, edges, isEdit]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        const trimmedId = id.trim();
        const trimmedName = name.trim();
        const nextFieldErrors: { id?: string; name?: string } = {};

        if (!trimmedName) {
            nextFieldErrors.name = 'Укажите название буровой.';
        }
        if (!isEdit && !trimmedId) {
            nextFieldErrors.id = 'Укажите системный ID буровой.';
        }

        setFieldErrors(nextFieldErrors);
        if (Object.keys(nextFieldErrors).length > 0) {
            return;
        }
        
        mutation.mutate({
            id: isEdit ? undefined : trimmedId,
            name: trimmedName,
            parent_id: parentId || null,
        });
    };
    
    const inputStyle = { backgroundColor: 'var(--card-bg)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' };
    const labelStyle = { color: 'var(--text-primary)' };
    const title = mode === 'edit'
        ? 'Редактирование буровой'
        : mode === 'create-child'
            ? 'Создание дочерней буровой'
            : 'Создание корневой буровой';
    const description = mode === 'edit'
        ? 'Обновите название или положение элемента в иерархии.'
        : mode === 'create-child'
            ? `Новая буровая будет создана внутри "${parentEdge?.name ?? parentEdge?.id}".`
            : 'Создайте новый корневой элемент структуры буровых.';

    return (
        <form onSubmit={handleSubmit} className="p-fluid edge-explorer-form">
            {error && <Message severity="error" text={error} className="mb-3" />}
            <div className="edge-explorer-form-intro">
                <div className="edge-explorer-form-title">{title}</div>
                <div className="edge-explorer-form-description">{description}</div>
            </div>
            
            <div className="edge-explorer-form-section">
                <div className="edge-explorer-form-section-title">Основные сведения</div>
                <div className="edge-explorer-form-grid">
            <div className="field">
                        <label htmlFor="id" className="font-semibold mb-2 block" style={labelStyle}>ID буровой</label>
                <InputText 
                    id="id" 
                    value={id} 
                            onChange={(e) => {
                                setId(e.target.value);
                                if (fieldErrors.id) {
                                    setFieldErrors((current) => ({ ...current, id: undefined }));
                                }
                            }}
                    disabled={isEdit || mutation.isPending} 
                    required 
                    style={inputStyle}
                            placeholder="Например: roman-main"
                />
                        {fieldErrors.id && <small className="edge-explorer-form-error">{fieldErrors.id}</small>}
                        {isEdit && <small className="edge-explorer-form-hint">ID фиксирован после создания и используется в интеграциях.</small>}
            </div>
            
                    <div className="field">
                <label htmlFor="name" className="font-semibold mb-2 block" style={labelStyle}>Название</label>
                <InputText 
                    id="name"
                    value={name}
                            onChange={(e) => {
                                setName(e.target.value);
                                if (fieldErrors.name) {
                                    setFieldErrors((current) => ({ ...current, name: undefined }));
                                }
                            }}
                    required 
                    disabled={mutation.isPending}
                    style={inputStyle}
                            placeholder="Отображаемое название буровой"
                />
                        {fieldErrors.name && <small className="edge-explorer-form-error">{fieldErrors.name}</small>}
                    </div>
                </div>
            </div>

            <div className="edge-explorer-form-section">
                <div className="edge-explorer-form-section-title">Положение в структуре</div>
                <div className="field">
                    <label htmlFor="parent" className="font-semibold mb-2 block" style={labelStyle}>Расположение в структуре</label>
                <Dropdown
                    id="parent"
                    value={parentId}
                    onChange={(e) => setParentId(e.value)}
                        options={[{ id: '', label: 'Без родителя — корневая буровая' }, ...availableParents]}
                        optionLabel="label"
                    optionValue="id"
                        placeholder="Выберите родительский элемент"
                    disabled={mutation.isPending}
                    style={inputStyle}
                        filter
                />
                    <small className="edge-explorer-form-hint">Можно оставить пустым, чтобы элемент был корневым.</small>
                </div>
            </div>

            <div className="edge-explorer-form-footer mt-4">
                <Button 
                    label={isEdit ? 'Сохранить изменения' : 'Создать буровую'}
                    icon={isEdit ? 'pi pi-save' : 'pi pi-plus'}
                    type="submit" 
                    loading={mutation.isPending} 
                    className="edge-explorer-primary-btn"
                />
                <Button 
                    label="Отмена"
                    icon="pi pi-times"
                    type="button"
                    onClick={onClose} 
                    severity="secondary"
                    text
                    disabled={mutation.isPending} 
                />
            </div>
        </form>
    );
};

export default function EdgesTable({ title }: Props) {
    const queryClient = useQueryClient();
    const [openForm, setOpenForm] = useState(false);
    const [formMode, setFormMode] = useState<EdgeFormMode>('create-root');
    const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);
    const [formParentEdge, setFormParentEdge] = useState<Edge | null>(null);
    const [deleteError, setDeleteError] = useState('');
    const [globalFilterValue, setGlobalFilterValue] = useState('');
    const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
    const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});
    const [deleteTarget, setDeleteTarget] = useState<EdgeTreeNode | null>(null);

    const { data: edges, isLoading, error } = useQuery<Edge[]>({
        queryKey: ['edges'],
        queryFn: getEdgesForAdmin,
    });

    const deleteMutation = useMutation({
        mutationFn: deleteEdge,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['edges'] });
            setDeleteError('');
        },
        onError: (err: any) => {
            setDeleteError(getErrorMessage(err, 'Не удалось удалить edge.'));
        }
    });

    const allEdges = edges || [];
    const { tree: treeData, byId } = useMemo(() => buildEdgeTree(allEdges), [allEdges]);
    const flattenedTree = useMemo(() => flattenTree(treeData), [treeData]);
    const filteredTree = useMemo(() => filterTree(treeData, globalFilterValue), [treeData, globalFilterValue]);

    useEffect(() => {
        if (!globalFilterValue.trim()) {
            return;
        }

        if (Object.keys(filteredTree.autoExpandedKeys).length > 0) {
            setExpandedKeys((current) => ({ ...current, ...filteredTree.autoExpandedKeys }));
        }
    }, [filteredTree.autoExpandedKeys, globalFilterValue]);

    useEffect(() => {
        if (treeData.length === 0) {
            if (selectedEdgeId !== null) {
                setSelectedEdgeId(null);
            }
            return;
        }

        if (selectedEdgeId && byId.has(selectedEdgeId)) {
            return;
        }

        setSelectedEdgeId(treeData[0]?.key ?? null);
    }, [byId, selectedEdgeId, treeData]);

    const stats = useMemo(() => {
        const total = allEdges.length;
        const rootCount = treeData.length;
        const nestedCount = Math.max(total - rootCount, 0);
        const leafCount = flattenedTree.filter((node) => node.children.length === 0).length;
        const maxDepth = flattenedTree.reduce((depth, node) => Math.max(depth, node.level + 1), 0);

        return {
            total,
            rootCount,
            nestedCount,
            leafCount,
            maxDepth,
        };
    }, [allEdges.length, flattenedTree, treeData.length]);

    const selectedNode = selectedEdgeId ? byId.get(selectedEdgeId) ?? null : null;
    const selectedParentNode = selectedNode?.data.parent_id ? byId.get(selectedNode.data.parent_id) ?? null : null;
    const formDialogMeta = getFormDialogMeta(formMode, formParentEdge);

    const handleEdit = (edge: Edge) => {
        setFormMode('edit');
        setSelectedEdge(edge);
        setFormParentEdge(null);
        setOpenForm(true);
    };

    const handleCreate = () => {
        setFormMode('create-root');
        setSelectedEdge(null);
        setFormParentEdge(null);
        setOpenForm(true);
    };

    const handleCreateChild = (parent: Edge) => {
        setFormMode('create-child');
        setSelectedEdge(null);
        setFormParentEdge(parent);
        setOpenForm(true);
        setSelectedEdgeId(parent.id);
    };

    const handleHideForm = () => {
        setOpenForm(false);
        setSelectedEdge(null);
        setFormParentEdge(null);
    };

    const handleDelete = (node: EdgeTreeNode) => {
        setDeleteError('');
        if (node.descendantsCount > 0) {
            setDeleteError(`Нельзя удалить "${node.data.name}", пока внутри есть дочерние элементы (${node.descendantsCount}). Сначала перенесите или удалите вложенные буровые.`);
            setSelectedEdgeId(node.key);
            return;
        }

        setDeleteTarget(node);
    };

    const toggleExpanded = (nodeId: string) => {
        setExpandedKeys((current) => {
            if (current[nodeId]) {
                const next = { ...current };
                delete next[nodeId];
                return next;
            }

            return {
                ...current,
                [nodeId]: true,
            };
        });
    };

    const renderTreeNode = (node: EdgeTreeNode) => {
        const hasChildren = node.children.length > 0;
        const isExpanded = expandedKeys[node.key] ?? false;
        const isSelected = selectedEdgeId === node.key;
        const isMatched = filteredTree.matchedIds.has(node.key);
        const actionLoading = deleteMutation.isPending && deleteMutation.variables === node.data.id;

        return (
            <div key={node.key} className="edge-tree-node">
                <div className={`edge-tree-item ${isSelected ? 'is-selected' : ''} ${isMatched ? 'is-matched' : ''}`}>
                    <div className="edge-tree-item-main" style={{ paddingLeft: `${16 + (node.level * 18)}px` }}>
                        <button
                            type="button"
                            className={`edge-tree-toggle ${!hasChildren ? 'is-hidden' : ''}`}
                            onClick={() => toggleExpanded(node.key)}
                            aria-label={isExpanded ? 'Свернуть раздел' : 'Развернуть раздел'}
                        >
                            <i className={`pi ${isExpanded ? 'pi-angle-down' : 'pi-angle-right'}`} />
                        </button>
                        <button
                            type="button"
                            className="edge-tree-select"
                            onClick={() => {
                                setSelectedEdgeId(node.key);
                                setDeleteError('');
                            }}
                        >
                            <span className={`edge-tree-icon ${hasChildren ? 'is-parent' : 'is-leaf'}`}>
                                <i className={`pi ${hasChildren ? 'pi-sitemap' : 'pi-circle-fill'}`} />
                            </span>
                            <span className="edge-tree-copy">
                                <span className="edge-tree-name">{renderHighlightedText(node.data.name, globalFilterValue)}</span>
                                <span className="edge-tree-meta">{renderHighlightedText(node.data.id, globalFilterValue)}</span>
                            </span>
                        </button>
                    </div>

                    <div className="edge-tree-item-side">
                        {hasChildren && (
                            <span className="edge-tree-badge">{node.children.length} доч.</span>
                        )}
                        <div className="edge-tree-actions">
                            <button
                                type="button"
                                className="edge-tree-action"
                                onClick={() => handleCreateChild(node.data)}
                                title="Создать дочернюю буровую"
                                aria-label="Создать дочернюю буровую"
                            >
                                <i className="pi pi-plus" />
                            </button>
                            <button
                                type="button"
                                className="edge-tree-action"
                                onClick={() => handleEdit(node.data)}
                                title="Редактировать буровую"
                                aria-label="Редактировать буровую"
                            >
                                <i className="pi pi-pencil" />
                            </button>
                            <button
                                type="button"
                                className="edge-tree-action is-danger"
                                onClick={() => handleDelete(node)}
                                title="Удалить буровую"
                                aria-label="Удалить буровую"
                                disabled={actionLoading}
                            >
                                <i className={`pi ${actionLoading ? 'pi-spin pi-spinner' : 'pi-trash'}`} />
                            </button>
                        </div>
                    </div>
                </div>

                {hasChildren && isExpanded && (
                    <div className="edge-tree-children">
                        {node.children.map((child) => renderTreeNode(child))}
                    </div>
                )}
            </div>
        );
    };

    if (error) {
        return (
            <div className="edges-tree-table edges-explorer-page">
                <Message severity="error" text={`Ошибка загрузки данных: ${(error as Error).message}`} />
        </div>
    );
    }

    return (
        <div className="edges-tree-table edges-explorer-page">
            {deleteError && <Message severity="error" text={deleteError} className="mb-3" />}
            
            <section className="edges-overview">
                <div className="edges-overview-main">
                    <div className="edges-overview-copy">
                        <span className="edges-overview-kicker">Структура буровых</span>
                        <h2>{title}</h2>
                        <p>
                            Управляйте иерархией буровых в одном рабочем пространстве: находите нужный узел,
                            просматривайте контекст и безопасно меняйте структуру без переходов между таблицами.
                        </p>
                    </div>
                    <div className="edges-overview-actions">
                        <Button
                            label="Создать корневую буровую"
                            icon="pi pi-plus"
                            onClick={handleCreate}
                            className="edge-explorer-primary-btn"
                        />
                    </div>
                </div>

                <div className="edges-overview-stats">
                    <div className="edges-stat-card">
                        <span className="edges-stat-label">Всего элементов</span>
                        <strong>{stats.total}</strong>
                        <small>Все узлы иерархии буровых</small>
                    </div>
                    <div className="edges-stat-card">
                        <span className="edges-stat-label">Корневые буровые</span>
                        <strong>{stats.rootCount}</strong>
                        <small>Точки входа в структуру</small>
                    </div>
                    <div className="edges-stat-card">
                        <span className="edges-stat-label">Вложенные узлы</span>
                        <strong>{stats.nestedCount}</strong>
                        <small>Дочерние элементы внутри иерархии</small>
                    </div>
                    <div className="edges-stat-card">
                        <span className="edges-stat-label">Глубина дерева</span>
                        <strong>{stats.maxDepth}</strong>
                        <small>{stats.leafCount} конечных узлов</small>
                    </div>
                </div>
            </section>

            <section className="edges-workspace">
                <div className="edges-explorer-panel">
                    <div className="edges-panel-header">
                        <div>
                            <h3>Иерархия буровых</h3>
                            <p>Выберите узел, чтобы посмотреть его контекст и доступные действия.</p>
                        </div>
                        <div className="edges-panel-actions">
                            <Button
                                label="Развернуть все"
                                size="small"
                                text
                                icon="pi pi-angle-double-down"
                                onClick={() => setExpandedKeys(collectExpandedKeys(treeData))}
                            />
                            <Button
                                label="Свернуть все"
                                size="small"
                                text
                                icon="pi pi-angle-double-up"
                                onClick={() => setExpandedKeys({})}
                            />
                        </div>
                    </div>

                    <div className="edges-search-row">
                        <span className="p-input-icon-left edges-search-input">
                            <i className="pi pi-search" />
                            <InputText
                                value={globalFilterValue}
                                onChange={(e) => setGlobalFilterValue(e.target.value)}
                                placeholder="Поиск по названию или ID"
                            />
                        </span>
                        {globalFilterValue && (
                                            <Button 
                                label="Сбросить"
                                size="small"
                                text
                                icon="pi pi-times"
                                onClick={() => setGlobalFilterValue('')}
                            />
                        )}
                    </div>

                    {isLoading ? (
                        <div className="edges-panel-state">
                            <ProgressSpinner style={{ width: '44px', height: '44px' }} strokeWidth="4" />
                            <span>Загружаем структуру буровых...</span>
                        </div>
                    ) : filteredTree.nodes.length === 0 ? (
                        <div className="edges-panel-state">
                            <i className="pi pi-search" />
                            <strong>Совпадений не найдено</strong>
                            <span>Попробуйте поиск по части названия или системному ID.</span>
                        </div>
                    ) : (
                        <div className="edge-tree-list">
                            {filteredTree.nodes.map((node) => renderTreeNode(node))}
                        </div>
                    )}
                </div>

                <aside className="edges-detail-panel">
                    {selectedNode ? (
                        <>
                            <div className="edges-detail-header">
                                <div className="edges-detail-copy">
                                    <div className="edges-detail-tags">
                                        <span className="edges-detail-pill">{selectedNode.level === 0 ? 'Корневая буровая' : 'Вложенный элемент'}</span>
                                        {selectedNode.children.length > 0 && (
                                            <span className="edges-detail-pill is-secondary">{selectedNode.children.length} дочерних</span>
                                        )}
                                    </div>
                                    <h3>{selectedNode.data.name}</h3>
                                    <p>{selectedNode.pathNames.join(' / ')}</p>
                                </div>
                                <div className="edges-detail-actions">
                                    <Button
                                        label="Создать дочернюю"
                                        icon="pi pi-plus"
                                        onClick={() => handleCreateChild(selectedNode.data)}
                                        className="edge-explorer-primary-btn"
                                    />
                                    <Button
                                        label="Редактировать"
                                        icon="pi pi-pencil"
                                        severity="secondary"
                                        outlined
                                        onClick={() => handleEdit(selectedNode.data)}
                                    />
                                </div>
                            </div>

                            <div className="edges-detail-grid">
                                <div className="edges-detail-card">
                                    <span className="edges-detail-label">ID</span>
                                    <strong>{selectedNode.data.id}</strong>
                                </div>
                                <div className="edges-detail-card">
                                    <span className="edges-detail-label">Родитель</span>
                                    <strong>{selectedParentNode ? selectedParentNode.data.name : 'Корневой элемент'}</strong>
                                </div>
                                <div className="edges-detail-card">
                                    <span className="edges-detail-label">Прямые дочерние</span>
                                    <strong>{selectedNode.children.length}</strong>
                                </div>
                                <div className="edges-detail-card">
                                    <span className="edges-detail-label">Всего потомков</span>
                                    <strong>{selectedNode.descendantsCount}</strong>
                                </div>
                            </div>

                            <div className="edges-detail-section">
                                <div className="edges-detail-section-title">Путь в структуре</div>
                                <div className="edges-breadcrumbs">
                                    {selectedNode.pathNames.map((segment, index) => (
                                        <React.Fragment key={`${segment}-${index}`}>
                                            {index > 0 && <i className="pi pi-angle-right" />}
                                            <span>{segment}</span>
                                        </React.Fragment>
                                    ))}
                                </div>
                            </div>

                            <div className="edges-detail-section">
                                <div className="edges-detail-section-title">Быстрые действия</div>
                                <div className="edges-detail-danger-zone">
                                    <div>
                                        <strong>Удаление буровой</strong>
                                        <p>
                                            {selectedNode.descendantsCount > 0
                                                ? `Удаление недоступно: внутри есть ${selectedNode.descendantsCount} дочерних элементов.`
                                                : 'Удаление доступно. Перед действием проверьте, что элемент больше нигде не используется.'}
                                        </p>
                                    </div>
                                    <Button
                                        label="Удалить"
                                        icon="pi pi-trash"
                                        severity="danger"
                                        outlined
                                        disabled={selectedNode.descendantsCount > 0}
                                        loading={deleteMutation.isPending && deleteMutation.variables === selectedNode.data.id}
                                        onClick={() => handleDelete(selectedNode)}
                                    />
                                </div>
                            </div>

                            <div className="edges-detail-section">
                                <div className="edges-detail-section-title">Дочерние элементы</div>
                                {selectedNode.children.length === 0 ? (
                                    <div className="edges-detail-empty">
                                        У выбранной буровой пока нет дочерних элементов.
                                    </div>
                                ) : (
                                    <div className="edges-child-list">
                                        {selectedNode.children.map((child) => (
                                            <button
                                                type="button"
                                                key={child.key}
                                                className="edges-child-item"
                                                onClick={() => {
                                                    setSelectedEdgeId(child.key);
                                                    setExpandedKeys((current) => ({ ...current, [selectedNode.key]: true }));
                                                }}
                                            >
                                                <div>
                                                    <strong>{child.data.name}</strong>
                                                    <span>{child.data.id}</span>
                                                </div>
                                                <i className="pi pi-arrow-right" />
                                            </button>
                                        ))}
                                    </div>
                )}
            </div>
                        </>
                    ) : (
                        <div className="edges-detail-placeholder">
                            <i className="pi pi-sitemap" />
                            <strong>Выберите буровую</strong>
                            <span>Справа появятся сведения об элементе, путь в структуре и действия.</span>
                        </div>
                    )}
                </aside>
            </section>

            <Dialog
                visible={openForm}
                className="responsive-dialog responsive-dialog-md p-fluid edges-form-dialog"
                header={(
                    <div className="edges-dialog-header">
                        <span className="edges-dialog-header-icon">
                            <i className={formDialogMeta.icon} />
                        </span>
                        <div className="edges-dialog-header-copy">
                            <span className="edges-dialog-header-kicker">{formDialogMeta.kicker}</span>
                            <strong>{formDialogMeta.title}</strong>
                            <span>{formDialogMeta.description}</span>
                        </div>
                    </div>
                )}
                modal
                draggable={false}
                onHide={handleHideForm}
            >
                <EdgeForm 
                    mode={formMode}
                    edge={selectedEdge}
                    parentEdge={formParentEdge}
                    onClose={handleHideForm}
                    edges={allEdges}
                    treeNodes={treeData}
                />
            </Dialog>
            
            <Dialog
                visible={deleteTarget != null}
                className="responsive-dialog responsive-dialog-sm edges-delete-dialog"
                header={(
                    <div className="edges-dialog-header edges-dialog-header-danger">
                        <span className="edges-dialog-header-icon is-danger">
                            <i className="pi pi-trash" />
                        </span>
                        <div className="edges-dialog-header-copy">
                            <span className="edges-dialog-header-kicker">Опасное действие</span>
                            <strong>Удаление буровой</strong>
                            <span>Подтвердите действие только если элемент больше не нужен в текущей структуре.</span>
                        </div>
                    </div>
                )}
                modal
                draggable={false}
                onHide={() => setDeleteTarget(null)}
                footer={(
                    <div className="edges-delete-footer">
                        <Button
                            label="Отмена"
                            icon="pi pi-times"
                            text
                            severity="secondary"
                            onClick={() => setDeleteTarget(null)}
                            disabled={deleteMutation.isPending}
                        />
                        <Button
                            label="Удалить буровую"
                            icon="pi pi-trash"
                            severity="danger"
                            loading={deleteMutation.isPending && deleteMutation.variables === deleteTarget?.data.id}
                            onClick={() => {
                                if (!deleteTarget) {
                                    return;
                                }

                                deleteMutation.mutate(deleteTarget.data.id, {
                                    onSuccess: () => {
                                        setDeleteTarget(null);
                                    },
                                });
                            }}
                        />
                    </div>
                )}
            >
                {deleteTarget && (
                    <div className="edges-delete-dialog-body">
                        <div className="edges-delete-callout">
                            <strong>{deleteTarget.data.name}</strong>
                            <span>{deleteTarget.data.id}</span>
                        </div>

                        <div className="edges-delete-grid">
                            <div className="edges-delete-card">
                                <span className="edges-detail-label">Родитель</span>
                                <strong>{deleteTarget.data.parent_id ? (byId.get(deleteTarget.data.parent_id)?.data.name ?? deleteTarget.data.parent_id) : 'Корневой элемент'}</strong>
                            </div>
                            <div className="edges-delete-card">
                                <span className="edges-detail-label">Потомки</span>
                                <strong>{deleteTarget.descendantsCount}</strong>
                            </div>
                        </div>

                        <div className="edges-delete-note">
                            <i className="pi pi-info-circle" />
                            <span>Элемент будет удален без возможности восстановления. Перед подтверждением проверьте, что он не используется в интеграциях и соседних настройках.</span>
                        </div>
                    </div>
                )}
            </Dialog>
        </div>
    );
}