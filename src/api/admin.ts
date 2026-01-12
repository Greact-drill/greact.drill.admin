import { apiClient } from './client';

export interface Edge {
    id: string;
    name: string;
    parent_id?: string;
    parent?: Edge;
    children?: Edge[];
}

export interface TreeNode {
    key: string;
    data: Edge;
    children: TreeNode[];
}

export interface EdgePayload {
    id: string;
    name: string;
    parent_id?: string;
}

export async function getEdgesForAdmin(): Promise<Edge[]> {
    const response = await apiClient.get<Edge[]>('/edge');
    return response.data;
}

export async function getEdgeTreeForAdmin(): Promise<TreeNode[]> {
    const response = await apiClient.get<TreeNode[]>('/edge/tree');
    return response.data;
}

export async function getEdgeChildren(parentId: string): Promise<Edge[]> {
    const response = await apiClient.get<Edge[]>(`/edge/${parentId}/children`);
    return response.data;
}

export async function createEdge(data: EdgePayload): Promise<Edge> {
    const response = await apiClient.post<Edge>('/edge', data);
    return response.data;
}

export async function updateEdge(id: string, data: Partial<EdgePayload>): Promise<Edge> {
    const response = await apiClient.patch<Edge>(`/edge/${id}`, data);
    return response.data;
}

export async function deleteEdge(id: string): Promise<void> {
    await apiClient.delete(`/edge/${id}`);
}

// Удаляем блоки, так как они теперь часть edge иерархии
export interface TagPayload {
    id: string;
    name: string;
    min: number;
    max: number;
    comment: string;
    unit_of_measurement: string;
}
export type Tag = TagPayload;

export async function getTagsForAdmin(): Promise<Tag[]> {
    const response = await apiClient.get<Tag[]>('/tag');
    return response.data;
}

export async function createTag(data: TagPayload): Promise<Tag> {
    const response = await apiClient.post<Tag>('/tag', data);
    return response.data;
}

export async function updateTag(id: string, data: Partial<TagPayload>): Promise<Tag> {
    const response = await apiClient.patch<Tag>(`/tag/${id}`, data);
    return response.data;
}

export async function deleteTag(id: string): Promise<void> {
    await apiClient.delete(`/tag/${id}`);
}

export async function syncTags(edge: string = 'real'): Promise<{ message: string; count: number }> {
    const response = await apiClient.post<{ message: string; count: number }>(
        `/sync/tags?edge=${edge}`
    );
    return response.data;
}

export interface CustomizationPayload {
    key: string;
    value: string;
}

export interface BaseCustomization extends CustomizationPayload {
    edge_id?: string;
}

export interface TagCustomization extends CustomizationPayload {
    edge_id: string;
    tag_id: string;
}

// Edge Customization
export async function getEdgeCustomizationForAdmin(): Promise<BaseCustomization[]> {
    const response = await apiClient.get<BaseCustomization[]>('/edge-customization');
    return response.data;
}

export async function createEdgeCustomization(data: { edge_id: string } & CustomizationPayload): Promise<BaseCustomization> {
    const response = await apiClient.post<BaseCustomization>('/edge-customization', data);
    return response.data;
}

export async function updateEdgeCustomization(edgeId: string, key: string, data: Partial<CustomizationPayload>): Promise<BaseCustomization> {
    const response = await apiClient.patch<BaseCustomization>(`/edge-customization/${edgeId}/${key}`, data);
    return response.data;
}

export async function deleteEdgeCustomization(edgeId: string, key: string): Promise<void> {
    await apiClient.delete(`/edge-customization/${edgeId}/${key}`);
}

// Tag Customization
export async function getTagCustomizationForAdmin(): Promise<TagCustomization[]> {
    const response = await apiClient.get<TagCustomization[]>('/tag-customization');
    return response.data;
}

export async function createTagCustomization(data: TagCustomization): Promise<TagCustomization> {
    const response = await apiClient.post<TagCustomization>('/tag-customization', data);
    return response.data;
}

export async function updateTagCustomization(edgeId: string, tagId: string, key: string, data: Partial<CustomizationPayload>): Promise<TagCustomization> {
    const response = await apiClient.patch<TagCustomization>(`/tag-customization/${edgeId}/${tagId}/${key}`, data);
    return response.data;
}

export async function deleteTagCustomization(edgeId: string, tagId: string, key: string): Promise<void> {
    await apiClient.delete(`/tag-customization/${edgeId}/${tagId}/${key}`);
}

// Добавляем функцию для получения конфигураций виджетов по edge_id
export async function getWidgetConfigs(edgeId: string): Promise<TagCustomization[]> {
  const response = await apiClient.get<TagCustomization[]>(`/tag-customization/edge/${edgeId}`);
  return response.data;
}

// Добавляем функцию для получения конфигураций виджетов по странице
export async function getWidgetConfigsByPage(page: string): Promise<TagCustomization[]> {
  const response = await apiClient.get<TagCustomization[]>(`/tag-customization/page/${page}`);
  return response.data;
}

// Добавляем функцию для получения всех конфигураций виджетов
// Исправляем: добавляем дженерик типизацию для apiClient.get
export async function getAllWidgetConfigs(): Promise<any[]> {
  const response = await apiClient.get<any[]>('/edge/widget-configs/all');
  return response.data;
}

// Интерфейсы для конфигурации таблиц
export interface TableCell {
  type: 'text' | 'tag-number' | 'tag-text';
  value: string | null; // Для text - сам текст, для tag-number и tag-text - tag_id
  tag_id?: string; // Для tag типов
}

export interface TableConfig {
  page: string;
  title?: string;
  rows: number; // Количество строк
  cols: number; // Количество столбцов
  rowHeaders?: string[]; // Заголовки строк (опционально)
  colHeaders?: string[]; // Заголовки столбцов (опционально)
  cells: TableCell[][]; // Двумерный массив ячеек [row][col]
}

export interface TableConfigWithData extends TableConfig {
  id: number;
  data?: {
    // Данные для тегов - массив значений по индексам ячеек
    [rowIndex: number]: {
      [colIndex: number]: {
        value: number | null;
        tag: {
          id: string;
          name: string;
          comment: string;
          unit_of_measurement: string;
          min: number;
          max: number;
        } | null;
        updatedAt: string | null;
      } | null;
    };
  };
}

// Функции для работы с таблицами
export async function getTableConfigByPage(page: string): Promise<TableConfigWithData | null> {
  const response = await apiClient.get<TableConfigWithData | null>(`/edge/page/${page}/table-config`);
  return response.data;
}

export async function getAllTableConfigs(): Promise<TableConfig[]> {
  const response = await apiClient.get<TableConfig[]>('/edge/table-configs/all');
  return response.data;
}

export async function createTableConfig(page: string, config: TableConfig): Promise<BaseCustomization> {
  // Сохраняем конфигурацию таблицы через edge-customization
  // edge_id = page, key = 'tableConfig', value = JSON.stringify(config)
  return createEdgeCustomization({
    edge_id: page,
    key: 'tableConfig',
    value: JSON.stringify(config)
  });
}

export async function updateTableConfig(page: string, config: TableConfig): Promise<BaseCustomization> {
  // Обновляем конфигурацию таблицы через edge-customization
  return updateEdgeCustomization(page, 'tableConfig', {
    value: JSON.stringify(config)
  });
}

export async function deleteTableConfig(page: string): Promise<void> {
  // Удаляем конфигурацию таблицы через edge-customization
  return deleteEdgeCustomization(page, 'tableConfig');
}