import React, { useState, useEffect } from 'react';
import { Tree } from 'primereact/tree';
import type { TreeNode as PrimeTreeNode } from 'primereact/treenode';
import { getEdgeTreeForAdmin, type Edge, type TreeNode } from '../api/admin';

interface EdgeTreeSelectorProps {
  selectedEdgeId: string;
  onSelectEdge: (edgeId: string, edgePath: Edge[]) => void;
}

// Тип для узла дерева с дополнительными данными
interface TreeDataNode extends PrimeTreeNode {
  edgeData: Edge;
  children?: TreeDataNode[];
}

const EdgeTreeSelector: React.FC<EdgeTreeSelectorProps> = ({ 
  selectedEdgeId, 
  onSelectEdge 
}) => {
  const [treeNodes, setTreeNodes] = useState<TreeDataNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});
  const [selectedKeys, setSelectedKeys] = useState<Record<string, boolean>>({});

  // Загружаем дерево edge
  useEffect(() => {
    const loadEdgeTree = async () => {
      try {
        setLoading(true);
        const treeData = await getEdgeTreeForAdmin();
        
        // Преобразуем в формат PrimeReact Tree
        const transformedNodes = transformTreeNodes(treeData);
        setTreeNodes(transformedNodes);
        
        // Автоматически раскрываем корневые узлы
        const initialExpandedKeys: Record<string, boolean> = {};
        const expandNode = (nodes: TreeDataNode[]) => {
          nodes.forEach(node => {
            if (node.children && node.children.length > 0) {
              // Гарантируем, что key это строка
              const nodeKey = node.key as string;
              initialExpandedKeys[nodeKey] = true;
              expandNode(node.children);
            }
          });
        };
        expandNode(transformedNodes);
        setExpandedKeys(initialExpandedKeys);
        
      } catch (error) {
        console.error('Ошибка загрузки дерева edge:', error);
      } finally {
        setLoading(false);
      }
    };

    loadEdgeTree();
  }, []);

  // Обновляем выбранный ключ при изменении selectedEdgeId
  useEffect(() => {
    if (selectedEdgeId) {
      setSelectedKeys({ [selectedEdgeId]: true });
    }
  }, [selectedEdgeId]);

  // Функция для преобразования TreeNode в формат PrimeReact
  const transformTreeNodes = (nodes: TreeNode[]): TreeDataNode[] => {
    return nodes.map(node => {
      const hasChildren = node.children && node.children.length > 0;
      
      // Гарантируем, что key это строка
      const nodeKey = String(node.key);
      
      return {
        key: nodeKey,
        label: node.data.name,
        // Не устанавливаем icon, чтобы PrimeReact Tree не рендерил иконку автоматически
        // Иконка будет рендериться только в nodeTemplate
        edgeData: node.data,
        children: node.children ? transformTreeNodes(node.children) : undefined,
        data: {
          name: node.data.name,
          id: node.data.id,
          hasChildren: hasChildren,
          icon: hasChildren ? 'pi pi-folder' : 'pi pi-tag' // Сохраняем иконку в data для использования в nodeTemplate
        }
      };
    });
  };

  // Кастомный шаблон для отображения узлов
  const nodeTemplate = (node: PrimeTreeNode) => {
    // Приводим тип к TreeDataNode для доступа к edgeData
    const treeDataNode = node as TreeDataNode;
    const nodeKey = treeDataNode.key as string;
    const isSelected = selectedKeys[nodeKey];
    
    // Получаем иконку из data или определяем по наличию детей
    const icon = treeDataNode.data?.icon || (treeDataNode.children && treeDataNode.children.length > 0 ? 'pi pi-folder' : 'pi pi-tag');
    
    return (
      <div 
        className={`flex align-items-center justify-content-between ${isSelected ? 'node-selected' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          handleNodeClick(treeDataNode);
        }}
      >
        <div className="flex align-items-center">
          <i className={`mr-2 ${icon}`}></i>
          <span>{treeDataNode.label}</span>
        </div>
        {treeDataNode.children && treeDataNode.children.length > 0 && (
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {treeDataNode.children.length}
          </span>
        )}
      </div>
    );
  };

  // Обработчик клика по узлу
  const handleNodeClick = (node: TreeDataNode) => {
    // Гарантируем, что key это строка
    const nodeKey = node.key as string;
    const newSelectedKeys = { [nodeKey]: true };
    setSelectedKeys(newSelectedKeys);
    
    // Находим путь до выбранного edge
    const findPath = (nodes: TreeDataNode[], targetKey: string, path: Edge[] = []): Edge[] | null => {
      for (const currentNode of nodes) {
        const currentKey = currentNode.key as string;
        const newPath = [...path, currentNode.edgeData];
        if (currentKey === targetKey) {
          return newPath;
        }
        if (currentNode.children) {
          const result = findPath(currentNode.children, targetKey, newPath);
          if (result) return result;
        }
      }
      return null;
    };

    const edgePath = findPath(treeNodes, nodeKey) || [node.edgeData];
    onSelectEdge(nodeKey, edgePath);
  };

  // Обработчик раскрытия/скрытия узла
  const handleToggle = (event: any) => {
    setExpandedKeys(event.value);
  };

  // Обработчик выбора узла через дерево (если используется стандартный выбор)
  const handleNodeSelect = (event: any) => {
    const node = treeNodes.find(n => n.key === event.value);
    if (node) {
      handleNodeClick(node);
    }
  };

  return (
    <div className="edge-tree-selector">
      <div className="tree-header">
        <h3>Иерархия оборудования</h3>
        <div className="tree-info">
          <i className="pi pi-info-circle"></i>
          <small>Выберите элемент для настройки виджетов</small>
        </div>
      </div>
      
      <div className="tree-container">
        {loading ? (
          <div className="loading-message">
            <i className="pi pi-spin pi-spinner"></i>
            <span>Загрузка дерева...</span>
          </div>
        ) : treeNodes.length === 0 ? (
          <div className="empty-message">
            <i className="pi pi-inbox"></i>
            <span>Нет элементов для отображения</span>
          </div>
        ) : (
          <Tree
            value={treeNodes}
            selectionMode="single"
            selectionKeys={selectedKeys}
            expandedKeys={expandedKeys}
            onSelectionChange={handleNodeSelect}
            onToggle={handleToggle}
            filter
            filterPlaceholder="Поиск по названию..."
            nodeTemplate={nodeTemplate}
            className="edge-tree"
          />
        )}
      </div>
    </div>
  );
};

export default EdgeTreeSelector;