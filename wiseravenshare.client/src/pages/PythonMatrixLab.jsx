import React, { useEffect, useState } from "react";
import Navbar from "@/components/landing/Navbar";
import { apiClient } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calculator, Database, History, RefreshCw, Rows3, Sigma } from "lucide-react";

const defaultTransposeInput = `{
  "matrix": [
    [1, 2, 3],
    [4, 5, 6]
  ]
}`;

const defaultMultiplyInput = `{
  "left": [
    [1, 2],
    [3, 4]
  ],
  "right": [
    [5, 6],
    [7, 8]
  ]
}`;

const formatJson = (value) => JSON.stringify(value, null, 2);

export default function PythonMatrixLab() {
  const [serviceHealth, setServiceHealth] = useState(null);
  const [databaseHealth, setDatabaseHealth] = useState(null);
  const [statusError, setStatusError] = useState("");
  const [loadingHealth, setLoadingHealth] = useState(false);

  const [transposeInput, setTransposeInput] = useState(defaultTransposeInput);
  const [transposeResult, setTransposeResult] = useState("");
  const [transposeError, setTransposeError] = useState("");
  const [loadingTranspose, setLoadingTranspose] = useState(false);

  const [multiplyInput, setMultiplyInput] = useState(defaultMultiplyInput);
  const [multiplyResult, setMultiplyResult] = useState("");
  const [multiplyError, setMultiplyError] = useState("");
  const [loadingMultiply, setLoadingMultiply] = useState(false);

  const [quickLeft, setQuickLeft] = useState("2, 0; 1, 3");
  const [quickRight, setQuickRight] = useState("4, 5; 6, 7");
  const [historyItems, setHistoryItems] = useState([]);
  const [historyError, setHistoryError] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(false);

  const refreshHistory = async () => {
    setLoadingHistory(true);
    setHistoryError("");

    try {
      const response = await apiClient.pythonMatrix.history(12);
      setHistoryItems(response.items || []);
    } catch (error) {
      setHistoryError(error.message || "Could not load matrix operation history.");
    } finally {
      setLoadingHistory(false);
    }
  };

  const refreshHealth = async () => {
    setLoadingHealth(true);
    setStatusError("");

    try {
      const [service, database] = await Promise.all([
        apiClient.pythonMatrix.health(),
        apiClient.pythonMatrix.databaseHealth(),
      ]);
      setServiceHealth(service);
      setDatabaseHealth(database);
      await refreshHistory();
    } catch (error) {
      setStatusError(error.message || "Could not reach the Python matrix service.");
    } finally {
      setLoadingHealth(false);
    }
  };

  const runTranspose = async () => {
    setLoadingTranspose(true);
    setTransposeError("");

    try {
      const payload = JSON.parse(transposeInput);
      const response = await apiClient.pythonMatrix.transpose(payload);
      setTransposeResult(formatJson(response));
      await refreshHistory();
    } catch (error) {
      setTransposeError(error.message || "Transpose request failed.");
      setTransposeResult("");
    } finally {
      setLoadingTranspose(false);
    }
  };

  const runMultiply = async (payloadOverride) => {
    setLoadingMultiply(true);
    setMultiplyError("");

    try {
      const payload = payloadOverride ?? JSON.parse(multiplyInput);
      const response = await apiClient.pythonMatrix.multiply(payload);
      setMultiplyResult(formatJson(response));
      if (!payloadOverride) {
        setMultiplyInput(formatJson(payload));
      }
      await refreshHistory();
    } catch (error) {
      setMultiplyError(error.message || "Multiply request failed.");
      setMultiplyResult("");
    } finally {
      setLoadingMultiply(false);
    }
  };

  const parseQuickMatrix = (value) =>
    value
      .split(";")
      .map((row) => row.split(",").map((item) => Number(item.trim())))
      .filter((row) => row.length > 0 && row.some((item) => !Number.isNaN(item)));

  const runQuickMultiply = async () => {
    const payload = {
      left: parseQuickMatrix(quickLeft),
      right: parseQuickMatrix(quickRight),
    };

    setMultiplyInput(formatJson(payload));
    await runMultiply(payload);
  };

  useEffect(() => {
    refreshHealth();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 pt-24 pb-10">
        <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="font-heading text-3xl text-foreground text-glow">Python Matrix Lab</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Exercise the FastAPI-backed matrix service through the .NET API proxy, including health checks,
              transpose, and multiplication.
            </p>
          </div>
          <Button onClick={refreshHealth} disabled={loadingHealth} className="md:self-start">
            <RefreshCw className={loadingHealth ? "animate-spin" : ""} />
            Refresh service status
          </Button>
        </div>

        {statusError && (
          <div className="mb-6 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {statusError}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Rows3 className="w-5 h-5 text-primary" />
                Service health
              </CardTitle>
              <CardDescription>Checks the proxied Python service and its PostgreSQL connectivity.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-border bg-secondary/40 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Calculator className="w-4 h-4 text-accent" />
                  Python service
                </div>
                <pre className="overflow-auto text-xs text-muted-foreground whitespace-pre-wrap">
                  {serviceHealth ? formatJson(serviceHealth) : "Press “Refresh service status” to load service health."}
                </pre>
              </div>
              <div className="rounded-lg border border-border bg-secondary/40 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Database className="w-4 h-4 text-accent" />
                  Database health
                </div>
                <pre className="overflow-auto text-xs text-muted-foreground whitespace-pre-wrap">
                  {databaseHealth ? formatJson(databaseHealth) : "Database health will appear here after refresh."}
                </pre>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Rows3 className="w-5 h-5 text-primary" />
                Matrix transpose
              </CardTitle>
              <CardDescription>Submit a 2D array payload and view the transposed matrix returned by the API proxy.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="transpose-payload">Transpose payload</Label>
                <Textarea
                  id="transpose-payload"
                  value={transposeInput}
                  onChange={(event) => setTransposeInput(event.target.value)}
                  className="min-h-[220px] font-mono text-xs"
                />
                <Button onClick={runTranspose} disabled={loadingTranspose}>
                  <Rows3 className="w-4 h-4" />
                  {loadingTranspose ? "Running transpose..." : "Run transpose"}
                </Button>
                {transposeError && <p className="text-sm text-destructive">{transposeError}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="transpose-result">Transpose result</Label>
                <Textarea
                  id="transpose-result"
                  value={transposeResult}
                  readOnly
                  className="min-h-[220px] font-mono text-xs"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sigma className="w-5 h-5 text-primary" />
                Quick multiply
              </CardTitle>
              <CardDescription>Enter matrices in row form using commas and semicolons, then send them to the proxy.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="quick-left">Left matrix</Label>
                <Input
                  id="quick-left"
                  value={quickLeft}
                  onChange={(event) => setQuickLeft(event.target.value)}
                  placeholder="2, 0; 1, 3"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quick-right">Right matrix</Label>
                <Input
                  id="quick-right"
                  value={quickRight}
                  onChange={(event) => setQuickRight(event.target.value)}
                  placeholder="4, 5; 6, 7"
                />
              </div>
              <Button onClick={runQuickMultiply} disabled={loadingMultiply}>
                <Calculator className="w-4 h-4" />
                {loadingMultiply ? "Calculating..." : "Run quick multiply"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sigma className="w-5 h-5 text-primary" />
                Matrix multiply
              </CardTitle>
              <CardDescription>Send explicit JSON payloads to the Flask matrix multiply endpoint through the API.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="multiply-payload">Multiply payload</Label>
                <Textarea
                  id="multiply-payload"
                  value={multiplyInput}
                  onChange={(event) => setMultiplyInput(event.target.value)}
                  className="min-h-[220px] font-mono text-xs"
                />
                <Button onClick={() => runMultiply()} disabled={loadingMultiply}>
                  <Calculator className="w-4 h-4" />
                  {loadingMultiply ? "Running multiply..." : "Run multiply"}
                </Button>
                {multiplyError && <p className="text-sm text-destructive">{multiplyError}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="multiply-result">Multiply result</Label>
                <Textarea
                  id="multiply-result"
                  value={multiplyResult}
                  readOnly
                  className="min-h-[220px] font-mono text-xs"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-6">
          <Card>
            <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <History className="w-5 h-5 text-primary" />
                  Operation history
                </CardTitle>
                <CardDescription>
                  Recent transpose and multiply requests persisted by the Python service in PostgreSQL.
                </CardDescription>
              </div>
              <Button variant="outline" onClick={refreshHistory} disabled={loadingHistory}>
                <RefreshCw className={loadingHistory ? "animate-spin" : ""} />
                Refresh history
              </Button>
            </CardHeader>
            <CardContent>
              {historyError && (
                <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {historyError}
                </div>
              )}
              {loadingHistory ? (
                <div className="text-sm text-muted-foreground">Loading operation history...</div>
              ) : historyItems.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No history yet. Run transpose or multiply to persist operations.
                </div>
              ) : (
                <div className="space-y-4">
                  {historyItems.map((item) => (
                    <div key={item.id} className="rounded-xl border border-border bg-secondary/30 p-4">
                      <div className="mb-3 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                        <div className="flex items-center gap-2">
                          <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium uppercase tracking-wide text-primary">
                            {item.operation}
                          </span>
                          <span className="text-xs text-muted-foreground">#{item.id}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(item.created_at).toLocaleString()}
                        </span>
                      </div>
                      <div className="grid gap-4 lg:grid-cols-2">
                        <div>
                          <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">
                            Request
                          </Label>
                          <pre className="overflow-auto rounded-lg border border-border bg-background/70 p-3 text-xs text-muted-foreground whitespace-pre-wrap">
                            {formatJson(item.request)}
                          </pre>
                        </div>
                        <div>
                          <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">
                            Result
                          </Label>
                          <pre className="overflow-auto rounded-lg border border-border bg-background/70 p-3 text-xs text-muted-foreground whitespace-pre-wrap">
                            {formatJson(item.result)}
                          </pre>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
