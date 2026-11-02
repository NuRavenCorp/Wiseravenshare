import { Navigate, Route, Routes } from 'react-router-dom';
import AiCommandCenter from './pages/ai/AiCommandCenter';
import AssistantPage from './pages/AssistantPage';

function App() {
  return (
    <Routes>
      <Route path="/assistant" element={<AssistantPage />} />
      <Route path="/ai" element={<AiCommandCenter />} />
      <Route path="*" element={<Navigate to="/assistant" replace />} />
    </Routes>
  );
}

export default App;