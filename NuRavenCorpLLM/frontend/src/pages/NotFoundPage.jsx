import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/common/Layout';
import { EmptyState } from '../components/common/EmptyState';
import { Button } from '../components/common/Button';
import { FiCompass } from 'react-icons/fi';

export default function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <Layout title="Not found" subtitle="The page you were looking for does not exist">
      <EmptyState
        icon={<FiCompass />}
        title="404 — Lost in the cosmos"
        description="The route you tried to reach isn't part of this platform."
        action={<Button onClick={() => navigate('/')}>Return to dashboard</Button>}
      />
    </Layout>
  );
}
