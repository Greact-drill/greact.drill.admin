import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TabView, TabPanel } from 'primereact/tabview';
import TagsTable from './TagsTable';
import EmulationDataPage from './EmulationDataPage';
import TagLayoutConstructor from './TagLayoutConstructor';

const TABS = [
  { key: 'list', label: 'Список тегов', icon: 'pi pi-list' },
  { key: 'emulation', label: 'Эмуляция', icon: 'pi pi-database' },
  { key: 'components', label: 'Компоненты тегов', icon: 'pi pi-th-large' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function TagsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as TabKey | null;
  const tabIndex = TABS.findIndex((t) => t.key === tabParam);
  const [activeIndex, setActiveIndex] = useState(tabIndex >= 0 ? tabIndex : 0);

  useEffect(() => {
    const idx = TABS.findIndex((t) => t.key === tabParam);
    if (idx >= 0) setActiveIndex(idx);
  }, [tabParam]);

  const handleTabChange = (e: { index: number }) => {
    const idx = e.index;
    setActiveIndex(idx);
    const key = TABS[idx].key;
    setSearchParams(key === 'list' ? {} : { tab: key }, { replace: true });
  };

  return (
    <div className="tags-page">
      <TabView activeIndex={activeIndex} onTabChange={handleTabChange}>
        <TabPanel header="Список тегов" leftIcon="pi pi-list">
          <TagsTable title="Теги" />
        </TabPanel>
        <TabPanel header="Эмуляция" leftIcon="pi pi-database">
          <EmulationDataPage title="Эмуляция" />
        </TabPanel>
        <TabPanel header="Компоненты тегов" leftIcon="pi pi-th-large">
          <TagLayoutConstructor title="Конструктор размещения тегов" />
        </TabPanel>
      </TabView>
    </div>
  );
}
