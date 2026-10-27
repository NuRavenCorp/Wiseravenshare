import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus, Mail, Lock, AtSign, Loader2, CheckCircle2, XCircle } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import GoogleIcon from "@/components/GoogleIcon";
import { safeReturnTo } from "@/lib/authReturnTo";

const USERNAME_RE = /^[a-z0-9_]{3,30}$/;

function sanitizeHandle(raw) {
  return raw.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 30);
}

function deriveFromEmail(email) {
  return sanitizeHandle((email || "").split("@")[0] || "");
}

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [username, setUsername] = useState("");
  const [usernameStatus, setUsernameStatus] = useState(null); // null | "checking" | "available" | "taken" | "invalid"
  const [usernameSuggestion, setUsernameSuggestion] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const debounceRef = useRef(null);
  const emailPopulatedRef = useRef(false);

  // Auto-populate username from email when the field is still empty
  useEffect(() => {
    if (emailPopulatedRef.current || username) return;
    const derived = deriveFromEmail(email);
    if (derived.length >= 3) {
      emailPopulatedRef.current = true;
      setUsername(derived);
    }
  }, [email, username]);

  // Debounced availability check whenever username changes
  useEffect(() => {
    const value = username.trim();
    if (!value) {
      setUsernameStatus(null);
      setUsernameSuggestion(null);
      return;
    }
    const sanitized = sanitizeHandle(value);
    if (!USERNAME_RE.test(sanitized)) {
      setUsernameStatus("invalid");
      setUsernameSuggestion(null);
      return;
    }
    setUsernameStatus("checking");
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const result = await apiClient.auth.checkUsername(sanitized);
        if (result?.available) {
          setUsernameStatus("available");
          setUsernameSuggestion(null);
        } else {
          setUsernameStatus("taken");
          setUsernameSuggestion(result?.suggestion || null);
        }
      } catch {
        setUsernameStatus(null);
      }
    }, 420);
    return () => clearTimeout(debounceRef.current);
  }, [username]);

  const handleUsernameChange = (e) => {
    const raw = e.target.value;
    const sanitized = sanitizeHandle(raw);
    setUsername(sanitized);
    emailPopulatedRef.current = true;
  };

  const acceptSuggestion = () => {
    if (usernameSuggestion) {
      setUsername(usernameSuggestion);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (usernameStatus === "taken") {
      setError("That username is already taken — choose another or accept the suggestion.");
      return;
    }
    if (username && usernameStatus === "invalid") {
      setError("Username must be 3–30 characters: letters, numbers, and underscores only.");
      return;
    }
    setLoading(true);
    try {
      const result = await apiClient.auth.register({
        email,
        password,
        username: username || undefined,
      });
      const token = result?.token || result?.access_token;
      if (token) {
        apiClient.auth.setToken(token);
        window.location.href = safeReturnTo();
        return;
      }

      setError("Account created, but sign-in could not be completed automatically.");
    } catch (err) {
      setError(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = () => {
    apiClient.auth.loginWithProvider("google", safeReturnTo());
  };

  const usernameAdornment = (() => {
    if (usernameStatus === "checking") return <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />;
    if (usernameStatus === "available") return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    if (usernameStatus === "taken" || usernameStatus === "invalid") return <XCircle className="w-4 h-4 text-destructive" />;
    return null;
  })();

  return (
    <AuthLayout
      icon={UserPlus}
      title="Create your account"
      subtitle="Sign up to get started"
      footer={
        <>
          Already have an account?{" "}
          <Link
            to={"/login" + (safeReturnTo() !== "/" ? "?returnTo=" + encodeURIComponent(safeReturnTo()) : "")}
            className="text-primary font-medium hover:underline"
          >
            Log in
          </Link>
        </>
      }
    >
      <Button
        variant="outline"
        className="w-full h-12 text-sm font-medium mb-6"
        onClick={handleGoogle}
      >
        <GoogleIcon className="w-5 h-5 mr-2" />
        Continue with Google
      </Button>

      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-3 text-muted-foreground">or</span>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="username">
            Username <span className="text-muted-foreground text-xs font-normal">(optional)</span>
          </Label>
          <div className="relative">
            <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="username"
              type="text"
              autoComplete="username"
              placeholder="yourhandle"
              value={username}
              onChange={handleUsernameChange}
              className="pl-10 pr-10 h-12"
              maxLength={30}
              spellCheck={false}
            />
            {usernameAdornment && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2">
                {usernameAdornment}
              </span>
            )}
          </div>
          {usernameStatus === "available" && (
            <p className="text-xs text-emerald-500">@{username} is available</p>
          )}
          {usernameStatus === "taken" && (
            <p className="text-xs text-destructive">
              @{username} is taken.{" "}
              {usernameSuggestion && (
                <button
                  type="button"
                  onClick={acceptSuggestion}
                  className="underline text-primary hover:no-underline"
                >
                  Use @{usernameSuggestion} instead?
                </button>
              )}
            </p>
          )}
          {usernameStatus === "invalid" && (
            <p className="text-xs text-destructive">3–30 characters: letters, numbers, underscores only.</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading || usernameStatus === "taken" || usernameStatus === "invalid"}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Creating account...
            </>
          ) : (
            "Create account"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}

