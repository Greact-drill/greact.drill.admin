import type{ Tag } from '../api/admin';

/**
 * Сортирует массив тегов по имени (name) в алфавитном порядке
 * Если имени нет, используется id
 * @param tags Массив тегов для сортировки
 * @returns Отсортированный массив тегов
 */
export const sortTagsByName = (tags: Tag[]): Tag[] => {
    return [...tags].sort((a, b) => {
        // Используем name для сортировки, если его нет - используем id
        const nameA = a.name || a.id;
        const nameB = b.name || b.id;
        
        return nameA.localeCompare(nameB, undefined, {
            sensitivity: 'base', // Игнорирует регистр и акценты
            numeric: true // Корректно обрабатывает числа в строках
        });
    });
};

/**
 * Создает массив опций для выпадающего списка из отсортированных тегов
 * @param tags Массив тегов
 * @returns Массив опций {label, value}
 */
export const getSortedTagOptions = (tags: Tag[]) => {
    if (!tags || tags.length === 0) return [];
    
    const sortedTags = sortTagsByName(tags);
    
    return sortedTags.map(tag => ({
        label: tag.name ? `${tag.name} (${tag.id})` : tag.id,
        value: tag.id
    }));
};

/**
 * Фильтрует и сортирует теги по выбранному edge
 * @param tags Массив тегов
 * @param selectedEdge ID выбранного edge (опционально)
 * @returns Отфильтрованный и отсортированный массив тегов
 */
export const getFilteredAndSortedTags = (tags: Tag[], selectedEdge?: string): Tag[] => {
    if (!tags || tags.length === 0) return [];

    const sortedTags = sortTagsByName(tags);
    
    if (!selectedEdge) return sortedTags;
    
    return sortedTags.filter(tag => tag.edge_ids?.includes(selectedEdge));
};