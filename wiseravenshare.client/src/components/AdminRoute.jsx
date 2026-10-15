import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { apiClient } from "@/api/client";

export default function AdminRoute({ children }) {
  const [state, setState] = useState({ loading: true, isAdmin: false });

  useEffect(() => {
    apiClient.auth
      .me()
      .then((user) => setState({ loading: false, isAdmin: user?.role === "admin" }))
      .catch(() => setState({ loading: false, isAdmin: false }));
  }, []);

  if (state.loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }
  if (!state.isAdmin) return <Navigate to="/login" replace />;
  return children;
}