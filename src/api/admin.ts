import { apiClient } from './client';

interface EdgePayload {
    id: string;
    name: string;
}

export type Edge = EdgePayload;

export async function getEdgesForAdmin(): Promise<EdgePayload[]> {
    const response = await apiClient.get<EdgePayload[]>('/edge');
    return response.data;
}

export async function createEdge(data: EdgePayload): Promise<EdgePayload> {
    const response = await apiClient.post<EdgePayload>('/edge', data);
    return response.data;
}

export async function updateEdge(id: string, data: Partial<EdgePayload>): Promise<EdgePayload> {
    const response = await apiClient.patch<EdgePayload>(`/edge/${id}`, data);
    return response.data;
}

export async function deleteEdge(id: string): Promise<void> {
    await apiClient.delete(`/edge/${id}`);
}

export interface BlockPayload {
    id: string;
    name: string;
    edge_id: string;
}

export type Block = BlockPayload;

export async function getBlocksForAdmin(): Promise<Block[]> {
    const response = await apiClient.get<Block[]>('/block');
    return response.data;
}

export async function createBlock(data: BlockPayload): Promise<Block> {
    const response = await apiClient.post<Block>('/block', data);
    return response.data;
}

export async function updateBlock(id: string, data: Partial<BlockPayload>): Promise<Block> {
    const response = await apiClient.patch<Block>(`/block/${id}`, data);
    return response.data;
}

export async function deleteBlock(id: string): Promise<void> {
    await apiClient.delete(`/block/${id}`);
}

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
    block_id?: string;
}

export interface TagCustomization extends CustomizationPayload {
    edge_id: string;
    tag_id: string;
}

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


export async function getBlockCustomizationForAdmin(): Promise<BaseCustomization[]> {
    const response = await apiClient.get<BaseCustomization[]>('/block-customization');
    return response.data;
}
export async function createBlockCustomization(data: { block_id: string } & CustomizationPayload): Promise<BaseCustomization> {
    const response = await apiClient.post<BaseCustomization>('/block-customization', data);
    return response.data;
}
export async function updateBlockCustomization(blockId: string, key: string, data: Partial<CustomizationPayload>): Promise<BaseCustomization> {
    const response = await apiClient.patch<BaseCustomization>(`/block-customization/${blockId}/${key}`, data);
    return response.data;
}
export async function deleteBlockCustomization(blockId: string, key: string): Promise<void> {
    await apiClient.delete(`/block-customization/${blockId}/${key}`);
}


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