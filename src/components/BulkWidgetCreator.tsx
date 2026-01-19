import React, { useState } from 'react';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { Dropdown } from 'primereact/dropdown';
import { Checkbox } from 'primereact/checkbox';
import { Message } from 'primereact/message';
import type { Edge, Tag } from '../api/admin';

interface BulkWidgetCreatorProps {
  parentEdge: Edge;
  childEdges: Edge[];
  tags: Tag[];
  onBulkCreate: (data: {
    edgeIds: string[];
    tagId: string;
    page: string;
    widgetType: string;
    customLabel?: string;
    positions: { x: number; y: number }[];
  }) => void;
}

const BulkWidgetCreator: React.FC<BulkWidgetCreatorProps> = ({
  parentEdge,
  childEdges,
  tags,
  onBulkCreate
}) => {
  const [visible, setVisible] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string>('');
  const [selectedPage, setSelectedPage] = useState<string>('KTU');
  const [selectedWidgetType, setSelectedWidgetType] = useState<string>('gauge');
  const [customLabel, setCustomLabel] = useState('');
  const [selectedChildren, setSelectedChildren] = useState<Record<string, boolean>>({});
  const [applyToAll, setApplyToAll] = useState(false);

  const PAGES = [
    { label: 'КТУ', value: 'KTU' },
    { label: 'Насосный блок', value: 'PUMPBLOCK' },
    { label: 'Аварии', value: 'ACCIDENT' },
    { label: 'Байпас', value: 'BYPASS' }
  ];

  const WIDGET_TYPES = [
    { label: 'Манометр', value: 'gauge' },
    { label: 'Вертикальная шкала', value: 'bar' },
    { label: 'Числовое значение', value: 'number' },
    { label: 'Статус', value: 'status' }
  ];

  // Автоматически выбираем всех детей при изменении родителя
  React.useEffect(() => {
    const initialSelection: Record<string, boolean> = {};
    childEdges.forEach(child => {
      initialSelection[child.id] = true;
    });
    setSelectedChildren(initialSelection);
  }, [childEdges]);

  const handleApplyToAllToggle = () => {
    const newValue = !applyToAll;
    setApplyToAll(newValue);
    
    if (newValue) {
      // Применяем ко всем детям
      const allSelected: Record<string, boolean> = {};
      childEdges.forEach(child => {
        allSelected[child.id] = true;
      });
      setSelectedChildren(allSelected);
    }
  };

  const handleChildToggle = (childId: string) => {
    setSelectedChildren(prev => ({
      ...prev,
      [childId]: !prev[childId]
    }));
  };

  const handleCreate = () => {
    const selectedEdgeIds = Object.entries(selectedChildren)
      .filter(([_, isSelected]) => isSelected)
      .map(([id]) => id);

    if (selectedEdgeIds.length === 0) {
      alert('Выберите хотя бы один дочерний элемент');
      return;
    }

    if (!selectedTag) {
      alert('Выберите тег');
      return;
    }

    // Генерируем позиции в сетке
    const positions = selectedEdgeIds.map((_, index) => {
      const row = Math.floor(index / 4);
      const col = index % 4;
      return {
        x: 20 + col * 260,
        y: 20 + row * 260
      };
    });

    onBulkCreate({
      edgeIds: selectedEdgeIds,
      tagId: selectedTag,
      page: selectedPage,
      widgetType: selectedWidgetType,
      customLabel: customLabel || undefined,
      positions
    });

    setVisible(false);
    resetForm();
  };

  const resetForm = () => {
    setSelectedTag('');
    setSelectedPage('KTU');
    setSelectedWidgetType('gauge');
    setCustomLabel('');
    setApplyToAll(false);
  };

  return (
    <>
      <Button
        label="Добавить виджеты потомкам"
        icon="pi pi-plus-circle"
        className="p-button-success"
        onClick={() => setVisible(true)}
        disabled={childEdges.length === 0}
        tooltip="Добавить одинаковые виджеты ко всем выбранным дочерним элементам"
      />

      <Dialog
        header="Массовое добавление виджетов"
        visible={visible}
        style={{ width: '600px' }}
        onHide={() => {
          setVisible(false);
          resetForm();
        }}
      >
        <div className="bulk-widget-form">
          <div className="mb-4">
            <h4>Родитель: {parentEdge.name}</h4>
            <small style={{ color: 'var(--text-secondary)' }}>
              Количество дочерних элементов: {childEdges.length}
            </small>
          </div>

          <div className="mb-3">
            <label className="block mb-2 font-medium">Тег</label>
            <Dropdown
              value={selectedTag}
              onChange={(e) => setSelectedTag(e.value)}
              options={tags}
              optionLabel="name"
              optionValue="id"
              placeholder="Выберите тег"
              className="w-full"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block mb-2 font-medium">Страница</label>
              <Dropdown
                value={selectedPage}
                onChange={(e) => setSelectedPage(e.value)}
                options={PAGES}
                placeholder="Выберите страницу"
                className="w-full"
              />
            </div>
            <div>
              <label className="block mb-2 font-medium">Тип виджета</label>
              <Dropdown
                value={selectedWidgetType}
                onChange={(e) => setSelectedWidgetType(e.value)}
                options={WIDGET_TYPES}
                placeholder="Выберите тип"
                className="w-full"
              />
            </div>
          </div>

          <div className="mb-3">
            <label className="block mb-2 font-medium">
              Пользовательская метка (опционально)
            </label>
            <input
              type="text"
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              placeholder="Метка для всех виджетов"
              className="w-full p-inputtext"
            />
          </div>

          <div className="mb-4">
            <div className="flex align-items-center mb-2">
              <Checkbox
                checked={applyToAll}
                onChange={handleApplyToAllToggle}
                id="applyToAll"
              />
              <label htmlFor="applyToAll" className="ml-2 font-medium">
                Применить ко всем дочерним элементам
              </label>
            </div>

            <div className="children-selection">
              <label className="block mb-2 font-medium">
                Выберите дочерние элементы:
              </label>
              <div className="children-grid">
                {childEdges.map(child => (
                  <div key={child.id} className="child-checkbox">
                    <Checkbox
                      checked={!!selectedChildren[child.id]}
                      onChange={() => handleChildToggle(child.id)}
                      id={`child-${child.id}`}
                    />
                    <label htmlFor={`child-${child.id}`} className="ml-2">
                      {child.name}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-content-end gap-2">
            <Button
              label="Отмена"
              icon="pi pi-times"
              className="p-button-secondary"
              onClick={() => {
                setVisible(false);
                resetForm();
              }}
            />
            <Button
              label="Создать"
              icon="pi pi-check"
              className="p-button-primary"
              onClick={handleCreate}
              disabled={!selectedTag}
            />
          </div>
        </div>
      </Dialog>
    </>
  );
};

export default BulkWidgetCreator;