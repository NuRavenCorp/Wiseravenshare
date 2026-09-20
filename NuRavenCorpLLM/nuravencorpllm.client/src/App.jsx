import { Navigate, Route, Routes } from 'react-router-dom';
import AiCommandCenter from './pages/ai/AiCommandCenter';

function App() {
  return (
    <Routes>
      <Route path="/ai" element={<AiCommandCenter />} />
      <Route path="*" element={<Navigate to="/ai" replace />} />
    </Routes>
  );
}

export default App;