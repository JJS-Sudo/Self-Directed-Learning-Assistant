import { Route, Routes } from 'react-router-dom'
import { AppLayout } from './layout/AppLayout'
import { AssessmentsPage } from './pages/AssessmentsPage'
import { GoalsPage } from './pages/GoalsPage'
import { MapPage } from './pages/MapPage'
import { MaterialMapPage } from './pages/MaterialMapPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PathPage } from './pages/PathPage'
import { QualityPage } from './pages/QualityPage'
import { SettingsPage } from './pages/SettingsPage'
import { ResourcesPage } from './pages/ResourcesPage'
import { RetrospectivesPage } from './pages/RetrospectivesPage'

/** 六区 + 页内 404。`index` 让 `/` 落在目标区。 */
export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<GoalsPage />} />
        <Route path="map" element={<MapPage />} />
        <Route path="map/material" element={<MaterialMapPage />} />
        <Route path="path" element={<PathPage />} />
        <Route path="resources" element={<ResourcesPage />} />
        <Route path="assess" element={<AssessmentsPage />} />
        <Route path="retro" element={<RetrospectivesPage />} />
        <Route path="quality" element={<QualityPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
