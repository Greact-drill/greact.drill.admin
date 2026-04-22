import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from 'primereact/button';
import { Dropdown } from 'primereact/dropdown';
import { Message } from 'primereact/message';
import { TabView, TabPanel } from 'primereact/tabview';
import {
  createEdgeCustomization,
  getEdgeCustomizationByEdge,
  getEdgesForAdmin,
  getTagsForAdmin,
  updateEdgeCustomization,
  type BaseCustomization,
  type Edge,
  type Tag
} from '../api/admin';
import { getErrorMessage } from '../utils/errorUtils';
import { getSortedTagOptions } from '../utils/tagUtils';
import PageHeader from '../ui/PageHeader';

type MaintenanceType =
  | 'daily_maintenance'
  | 'weekly_maintenance'
  | 'monthly_maintenance'
  | 'semiannual_maintenance'
  | 'annual_maintenance';

const MAINTENANCE_TYPES: Array<{ label: string; value: MaintenanceType; icon: string }> = [
  { label: 'Ежедневное', value: 'daily_maintenance', icon: 'pi pi-calendar' },
  { label: 'Еженедельное', value: 'weekly_maintenance', icon: 'pi pi-calendar-plus' },
  { label: 'Ежемесячное', value: 'monthly_maintenance', icon: 'pi pi-calendar-minus' },
  { label: 'Полугодовое', value: 'semiannual_maintenance', icon: 'pi pi-calendar-times' },
  { label: 'Годовое', value: 'annual_maintenance', icon: 'pi pi-calendar' }
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
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [selectedTagId, setSelectedTagId] = useState<string>('');
  const [config, setConfig] = useState<Record<MaintenanceType, string[]>>(emptyConfig);
  const [hasConfig, setHasConfig] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedMaintenanceType = MAINTENANCE_TYPES[activeTabIndex]?.value ?? 'daily_maintenance';

  const { data: tags, isLoading: tagsLoading } = useQuery<Tag[]>({
    queryKey: ['tags'],
    queryFn: getTagsForAdmin
  });

  const { data: edges = [] } = useQuery<Edge[]>({
    queryKey: ['edges'],
    queryFn: getEdgesForAdmin
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

  const tagOptions = useMemo(() => getSortedTagOptions(tags || []), [tags]);

  const availableTagOptions = useMemo(() => {
    const assigned = config[selectedMaintenanceType] ?? [];
    return tagOptions.filter(opt => !assigned.includes(opt.value));
  }, [tagOptions, config, selectedMaintenanceType]);

  const tagNameMap = useMemo(() => {
    const map = new Map<string, string>();
    tags?.forEach(tag => {
      map.set(tag.id, tag.name || tag.id);
    });
    return map;
  }, [tags]);

  const tagUnitMap = useMemo(() => {
    const map = new Map<string, string>();
    tags?.forEach(tag => {
      map.set(tag.id, tag.unit_of_measurement || '');
    });
    return map;
  }, [tags]);

  const rootEdges = useMemo(() => {
    return edges.filter(e => !e.parent_id);
  }, [edges]);

  const rootEdgeOptions = useMemo(() => {
    return rootEdges.map(e => ({ label: e.name || e.id, value: e.id }));
  }, [rootEdges]);

  const handleSelectEdge = (edgeId: string) => {
    setSelectedEdgeId(edgeId);
    setSelectedTagId('');
  };

  const handleAddTag = () => {
    if (!selectedTagId) return;
    setConfig(prev => {
      const current = prev[selectedMaintenanceType];
      if (current.includes(selectedTagId)) return prev;
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

  const totalTagsCount = Object.values(config).reduce((sum, arr) => sum + arr.length, 0);

  return (
    <div className="maintenance-config-page">
      <PageHeader
        kicker="Конфигурация"
        title="ТО"
        description="Выберите буровую и привяжите теги к каждому типу технического обслуживания."
      />

      {(errorMessage || successMessage) && (
        <div className="maintenance-config-messages">
          {errorMessage && <Message severity="error" text={errorMessage} />}
          {successMessage && <Message severity="success" text={successMessage} />}
        </div>
      )}

      <div className="maintenance-config-layout">
        <div className="maintenance-config-panel maintenance-config-main">
          <div className="maintenance-config-toolbar">
            <div className="maintenance-config-toolbar-row">
              <div className="maintenance-config-edge-select">
                <Dropdown
                  value={selectedEdgeId}
                  onChange={(e) => handleSelectEdge(e.value ?? '')}
                  options={rootEdgeOptions}
                  placeholder="Выберите буровую..."
                  className="maintenance-config-edge-dropdown"
                  filter
                  filterPlaceholder="Поиск..."
                />
              </div>
              <div className="maintenance-config-add-row">
                <Dropdown
                  value={selectedTagId}
                  onChange={(e) => setSelectedTagId(e.value ?? '')}
                  options={availableTagOptions}
                  placeholder={tagsLoading ? 'Загрузка...' : 'Выберите тег'}
                  filter
                  filterPlaceholder="Поиск тега..."
                  className="maintenance-config-tag-dropdown"
                  disabled={tagsLoading || !selectedEdgeId}
                />
                <Button
                  label="Добавить"
                  icon="pi pi-plus"
                  onClick={handleAddTag}
                  disabled={!selectedTagId}
                  className="maintenance-config-add-btn"
                />
              </div>
              <Button
                label="Сохранить"
                icon="pi pi-save"
                onClick={handleSave}
                disabled={!selectedEdgeId}
                className="maintenance-config-save-btn"
              />
            </div>
          </div>

          {!selectedEdgeId ? (
            <div className="maintenance-config-placeholder">
              <i className="pi pi-info-circle" />
              <p>Выберите буровую установку для настройки тегов ТО.</p>
            </div>
          ) : (
            <>
              <TabView
                activeIndex={activeTabIndex}
                onTabChange={(e) => setActiveTabIndex(e.index)}
                className="maintenance-config-tabs"
              >
                {MAINTENANCE_TYPES.map((mt) => (
                  <TabPanel
                    key={mt.value}
                    header={
                      <span className="maintenance-tab-header">
                        <i className={mt.icon} />
                        {mt.label}
                        <span className="maintenance-tab-badge">
                          {config[mt.value]?.length ?? 0}
                        </span>
                      </span>
                    }
                  >
                    <div className="maintenance-config-tags">
                      {config[selectedMaintenanceType].length === 0 ? (
                        <div className="maintenance-config-empty">
                          <i className="pi pi-inbox" />
                          <p>Теги для данного ТО не назначены.</p>
                          <span>Выберите тег выше и нажмите «Добавить»</span>
                        </div>
                      ) : (
                        <div className="maintenance-config-tag-list">
                          {config[selectedMaintenanceType].map(tagId => (
                            <div key={tagId} className="maintenance-config-tag">
                              <div className="maintenance-config-tag-info">
                                <span className="maintenance-config-tag-name">
                                  {tagNameMap.get(tagId) ?? tagId}
                                </span>
                                {tagUnitMap.get(tagId) && (
                                  <span className="maintenance-config-tag-unit">
                                    {tagUnitMap.get(tagId)}
                                  </span>
                                )}
                              </div>
                              <Button
                                icon="pi pi-times"
                                className="p-button-text p-button-danger p-button-rounded"
                                onClick={() => handleRemoveTag(tagId)}
                                tooltip="Удалить"
                                tooltipOptions={{ position: 'top' }}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </TabPanel>
                ))}
              </TabView>

              {totalTagsCount > 0 && (
                <div className="maintenance-config-summary">
                  Всего тегов: <strong>{totalTagsCount}</strong>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
