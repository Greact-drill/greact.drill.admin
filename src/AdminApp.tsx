import { useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import CustomizationTable from './components/CustomizationTable';
import DiagramWidgetsPage from './components/DiagramWidgetsPage';
import EdgesTable from './components/EdgesTable';
import MaintenanceConfigPage from './components/MaintenanceConfigPage';
import MediaConfigPage from './components/MediaConfigPage';
import TableConfigurator from './components/TableConfigurator';
import TagsPage from './components/TagsPage';
import './main.css';

const navItems = [
  { path: '/edges', name: 'Буровые', icon: 'pi pi-building' },
  { path: '/tags', name: 'Теги', icon: 'pi pi-bookmark' },
  { path: '/maintenance-config', name: 'ТО', icon: 'pi pi-wrench' },
  { path: '/media-config', name: 'Медиа', icon: 'pi pi-video' },
  { path: '/edge-customization', name: 'Компоненты буровых', icon: 'pi pi-sliders-h' },
  { path: '/table-config', name: 'Настройка таблиц', icon: 'pi pi-table' },
  { path: '/diagram-widgets', name: 'Схемные виджеты', icon: 'pi pi-sitemap' },
];

const MOBILE_BREAKPOINT = 768;

export default function AdminApp() {
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className={`admin-layout ${mobileMenuOpen ? 'mobile-menu-open' : ''}`}>
      {isMobile && mobileMenuOpen ? (
        <div className="admin-sidebar-overlay" onClick={() => setMobileMenuOpen(false)} aria-hidden="true" />
      ) : null}

      <aside
        className={`admin-sidebar ${sidebarCollapsed && !isMobile ? 'collapsed' : ''} ${isMobile ? 'mobile-drawer' : ''}`}
      >
        <div className="sidebar-header">
          {(!sidebarCollapsed || isMobile) ? <h1 className="logo-text">Drill</h1> : null}
          <div className="sidebar-header-actions">
            {isMobile ? (
              <button
                className="sidebar-toggle"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Закрыть меню"
                title="Закрыть меню"
              >
                <i className="pi pi-times" />
              </button>
            ) : (
              <button
                className="sidebar-toggle"
                onClick={() => setSidebarCollapsed((current) => !current)}
                aria-label={sidebarCollapsed ? 'Развернуть меню' : 'Свернуть меню'}
                title={sidebarCollapsed ? 'Развернуть меню' : 'Свернуть меню'}
              >
                <i className={sidebarCollapsed ? 'pi pi-angle-right' : 'pi pi-angle-left'} />
              </button>
            )}
          </div>
        </div>

        <nav className="sidebar-nav">
          <ul className="nav-list">
            {navItems.map((item) => {
              const isActive = location.pathname.includes(item.path);
              return (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    className={`nav-link ${isActive ? 'active' : ''}`}
                    target="_self"
                    title={sidebarCollapsed ? item.name : ''}
                  >
                    <i className={item.icon} />
                    {!sidebarCollapsed ? <span>{item.name}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      <main className={`admin-content ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <div className="content-header">
          {isMobile ? (
            <button
              className="mobile-menu-trigger"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Открыть меню"
              title="Меню"
            >
              <i className="pi pi-bars" />
            </button>
          ) : null}
          <h2 className="content-header-title">Администрирование</h2>
        </div>

        <div className="content-card">
          <Routes>
            <Route index element={<Navigate to="edges" replace />} />
            <Route path="edges" element={<EdgesTable title="Буровые" />} />
            <Route path="tags" element={<TagsPage />} />
            <Route path="emulation" element={<Navigate to="/tags?tab=emulation" replace />} />
            <Route path="tag-customization" element={<Navigate to="/tags?tab=components" replace />} />
            <Route path="maintenance-config" element={<MaintenanceConfigPage />} />
            <Route path="media-config" element={<MediaConfigPage />} />
            <Route path="edge-customization" element={<CustomizationTable type="edge" title="Компоненты буровых" />} />
            <Route path="table-config" element={<TableConfigurator title="Настройка таблиц" />} />
            <Route path="diagram-widgets" element={<DiagramWidgetsPage title="Схемные виджеты" />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
