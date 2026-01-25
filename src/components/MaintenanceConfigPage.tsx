import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from 'primereact/button';
import { Dropdown } from 'primereact/dropdown';
import { Message } from 'primereact/message';
import EdgeTreeSelector from './EdgeTreeSelector';
import {
  createEdgeCustomization,
  getEdgeCustomizationByEdge,
  getTagsForAdmin,
  updateEdgeCustomization,
  type BaseCustomization,
  type Tag
} from '../api/admin';
import { getErrorMessage } from '../utils/errorUtils';

type MaintenanceType =
  | 'daily_maintenance'
  | 'weekly_maintenance'
  | 'monthly_maintenance'
  | 'semiannual_maintenance'
  | 'annual_maintenance';

const maintenanceTypeOptions: Array<{ label: string; value: MaintenanceType }> = [
  { label: 'Ежедневное ТО', value: 'daily_maintenance' },
  { label: 'Еженедельное ТО', value: 'weekly_maintenance' },
  { label: 'Ежемесячное ТО', value: 'monthly_maintenance' },
  { label: 'Полугодовое ТО', value: 'semiannual_maintenance' },
  { label: 'Годовое ТО', value: 'annual_maintenance' }
];

const emptyConfig: Record<MaintenanceType, string[]> = {
  daily_maintenance: [],
  weekly_maintenance: [],
  monthly_maintenance: [],
  semiannual_maintenance: [],
  annual_maintenance: []
};

export default function MaintenanceConfigPage() {
  const [selectedEdgeId, setSelectedEdgeId] = useState('');
  const [selectedMaintenanceType, setSelectedMaintenanceType] = useState<MaintenanceType>('daily_maintenance');
  const [selectedTagId, setSelectedTagId] = useState<string>('');
  const [edgePathLabel, setEdgePathLabel] = useState('Не выбрано');
  const [config, setConfig] = useState<Record<MaintenanceType, string[]>>(emptyConfig);
  const [hasConfig, setHasConfig] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { data: tags, isLoading: tagsLoading } = useQuery<Tag[]>({
    queryKey: ['tags'],
    queryFn: getTagsForAdmin
  });

  const { data: edgeCustomizations, refetch: refetchCustomizations } = useQuery<BaseCustomization[]>({
    queryKey: ['edge-customizations', selectedEdgeId],
    queryFn: () => getEdgeCustomizationByEdge(selectedEdgeId),
    enabled: Boolean(selectedEdgeId)
  });

  useEffect(() => {
    if (!edgeCustomizations) {
      setConfig(emptyConfig);
      setHasConfig(false);
      return;
    }
    const existing = edgeCustomizations.find(item => item.key === 'maintenanceConfig');
    if (!existing) {
      setConfig(emptyConfig);
      setHasConfig(false);
      return;
    }
    try {
      const parsed = JSON.parse(existing.value) as Partial<Record<MaintenanceType, string[]>>;
      setConfig({
        daily_maintenance: parsed.daily_maintenance ?? [],
        weekly_maintenance: parsed.weekly_maintenance ?? [],
        monthly_maintenance: parsed.monthly_maintenance ?? [],
        semiannual_maintenance: parsed.semiannual_maintenance ?? [],
        annual_maintenance: parsed.annual_maintenance ?? []
      });
      setHasConfig(true);
    } catch (error) {
      setConfig(emptyConfig);
      setHasConfig(false);
      setErrorMessage('Не удалось прочитать конфигурацию ТО.');
    }
  }, [edgeCustomizations]);

  const tagOptions = useMemo(() => {
    if (!tags) return [];
    return tags.map(tag => ({
      label: tag.name ? `${tag.name} (${tag.id})` : tag.id,
      value: tag.id
    }));
  }, [tags]);

  const tagNameMap = useMemo(() => {
    const map = new Map<string, string>();
    tags?.forEach(tag => {
      map.set(tag.id, tag.name || tag.id);
    });
    return map;
  }, [tags]);

  const handleSelectEdge = (edgeId: string, path: Array<{ name: string }>) => {
    setSelectedEdgeId(edgeId);
    setEdgePathLabel(path.map(edge => edge.name).join(' / ') || 'Не выбрано');
  };

  const handleAddTag = () => {
    if (!selectedTagId) {
      return;
    }
    setConfig(prev => {
      const current = prev[selectedMaintenanceType];
      if (current.includes(selectedTagId)) {
        return prev;
      }
      return {
        ...prev,
        [selectedMaintenanceType]: [...current, selectedTagId]
      };
    });
    setSelectedTagId('');
  };

  const handleRemoveTag = (tagId: string) => {
    setConfig(prev => ({
      ...prev,
      [selectedMaintenanceType]: prev[selectedMaintenanceType].filter(id => id !== tagId)
    }));
  };

  const handleSave = async () => {
    if (!selectedEdgeId) {
      setErrorMessage('Сначала выберите буровую.');
      return;
    }
    setErrorMessage(null);
    const payload = JSON.stringify(config);
    try {
      if (hasConfig) {
        await updateEdgeCustomization(selectedEdgeId, 'maintenanceConfig', { value: payload });
      } else {
        await createEdgeCustomization({ edge_id: selectedEdgeId, key: 'maintenanceConfig', value: payload });
        setHasConfig(true);
      }
      setSuccessMessage('Конфигурация ТО успешно сохранена.');
      window.setTimeout(() => setSuccessMessage(null), 4000);
      refetchCustomizations();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Ошибка сохранения конфигурации ТО.'));
    }
  };

  return (
    <div className="maintenance-config-page">
      <div className="maintenance-config-header">
        <h3>Настройка ТО по буровым</h3>
        <p>Привяжите теги к каждому типу ТО для выбранной буровой установки.</p>
      </div>

      {(errorMessage || successMessage) && (
        <div className="mb-3">
          {errorMessage && <Message severity="error" text={errorMessage} />}
          {successMessage && <Message severity="success" text={successMessage} />}
        </div>
      )}

      <div className="maintenance-config-layout">
        <div className="maintenance-config-panel">
          <EdgeTreeSelector selectedEdgeId={selectedEdgeId} onSelectEdge={handleSelectEdge} />
          <div className="maintenance-config-edge">
            <span className="maintenance-config-label">Текущий путь:</span>
            <span className="maintenance-config-value">{edgePathLabel}</span>
          </div>
        </div>

        <div className="maintenance-config-panel">
          <div className="maintenance-config-controls">
            <Dropdown
              value={selectedMaintenanceType}
              onChange={(e) => setSelectedMaintenanceType(e.value)}
              options={maintenanceTypeOptions}
              placeholder="Выберите тип ТО"
              className="maintenance-config-dropdown"
            />
            <Dropdown
              value={selectedTagId}
              onChange={(e) => setSelectedTagId(e.value)}
              options={tagOptions}
              placeholder={tagsLoading ? 'Загрузка тегов...' : 'Выберите тег'}
              filter
              className="maintenance-config-dropdown"
              disabled={tagsLoading}
            />
            <Button
              label="Добавить тег"
              icon="pi pi-plus"
              onClick={handleAddTag}
              disabled={!selectedTagId}
            />
          </div>

          <div className="maintenance-config-tags">
            {config[selectedMaintenanceType].length === 0 ? (
              <div className="maintenance-config-empty">Теги для данного ТО не назначены.</div>
            ) : (
              config[selectedMaintenanceType].map(tagId => (
                <div key={tagId} className="maintenance-config-tag">
                  <span>{tagNameMap.get(tagId) ?? tagId}</span>
                  <Button
                    icon="pi pi-times"
                    className="p-button-text p-button-danger"
                    onClick={() => handleRemoveTag(tagId)}
                  />
                </div>
              ))
            )}
          </div>

          <div className="maintenance-config-footer">
            <Button
              label="Сохранить"
              icon="pi pi-save"
              onClick={handleSave}
              disabled={!selectedEdgeId}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
