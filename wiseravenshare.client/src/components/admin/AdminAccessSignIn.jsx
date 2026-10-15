import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import { Button } from '@/components/ui/button';

export default function AdminAccessSignIn() {
  return (
    <AuthLayout icon={ShieldCheck} title="Admin Access Request" subtitle="Sign in to submit a verified access request">
      <p className="text-sm text-muted-foreground mb-6">Requests are tied to your verified account email. Create an account first if you do not have one.</p>
      <div className="flex flex-col gap-3">
        <Button asChild><Link to="/login?returnTo=%2Fadmin-access">Sign in</Link></Button>
        <Button asChild variant="outline"><Link to="/register?returnTo=%2Fadmin-access">Create account</Link></Button>
      </div>
    </AuthLayout>
  );
}