import React, { useState } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ShieldCheck, Mail, User, Loader2, CheckCircle } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import AdminAccessSignIn from "@/components/admin/AdminAccessSignIn";
import { useAuth } from "@/lib/AuthContext";

export default function AdminAccess() {
  const { user, isAuthenticated } = useAuth();
  const email = user?.email || '';
  const [userid, setUserid] = useState("");
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const fullUserid = userid.startsWith("admin") ? userid : `admin-${userid}`;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!userid.trim()) {
      setError("A User ID is required.");
      return;
    }
    setLoading(true);
    try {
      const res = await apiClient.functions.invoke("RequestAdminAccess", {
        email,
        userid: fullUserid,
        name,
        reason,
        website,
      });
      if (res.data?.error) {
        setError(res.data.error);
      } else {
        setSubmitted(true);
      }
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Request failed");
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) return <AdminAccessSignIn />;

  if (submitted) {
    return (
      <AuthLayout
        icon={CheckCircle}
        title="Request submitted"
        subtitle="The primary administrator has been notified"
        footer={
          <Link to="/login" className="text-primary font-medium hover:underline">
            Back to login
          </Link>
        }
      >
        <div className="text-center space-y-3">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
          <p className="text-sm text-muted-foreground">
            Your admin access request for <span className="text-foreground font-medium">{email}</span> has been sent.
            The primary administrator will review your request before granting admin access.
          </p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      icon={ShieldCheck}
      title="Admin Access Request"
      subtitle="For admin team members only"
      footer={
        <Link to="/login" className="text-primary font-medium hover:underline">
          Back to login
        </Link>
      }
    >
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Your Name</Label>
          <Input
            id="name"
            type="text"
            autoFocus
            placeholder="Arnold Smith"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-12"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="userid">User ID</Label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <div className="flex items-center">
              <span className="inline-flex items-center px-3 h-12 rounded-l-md border border-r-0 border-input bg-secondary text-sm text-muted-foreground">
                admin-
              </span>
              <Input
                id="userid"
                type="text"
                placeholder="arnold"
                value={userid}
                onChange={(e) => setUserid(e.target.value)}
                className="rounded-l-none h-12"
                required
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Admin accounts use an admin-prefixed User ID (e.g. admin-arnold).
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              readOnly
              className="pl-10 h-12"
              required
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Your verified account email is used for this request.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="reason">Reason for Access</Label>
          <Textarea
            id="reason"
            placeholder="Briefly explain why you need admin access..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
        </div>
        {/* Honeypot field — hidden from real users, bots fill it and get rejected */}
        <input
          type="text"
          name="website"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
          className="absolute left-[-9999px] top-auto w-px h-px opacity-0"
          aria-hidden="true"
        />
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Submitting...
            </>
          ) : (
            "Request Access"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}