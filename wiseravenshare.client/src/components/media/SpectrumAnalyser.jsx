import React, { useEffect, useRef } from "react";

export default function SpectrumAnalyser({ analyserNode, playing }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    if (!analyserNode || !playing) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const bufferLength = analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      analyserNode.getByteFrequencyData(dataArray);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const barCount = 48;
      const step = Math.floor(bufferLength / barCount);
      const barWidth = canvas.width / barCount;
      for (let i = 0; i < barCount; i++) {
        const value = dataArray[i * step] || 0;
        const barHeight = (value / 255) * canvas.height;
        const x = i * barWidth;
        const grad = ctx.createLinearGradient(0, canvas.height, 0, canvas.height - barHeight);
        grad.addColorStop(0, "#8d52e0");
        grad.addColorStop(1, "#c6a8ea");
        ctx.fillStyle = grad;
        ctx.fillRect(x, canvas.height - barHeight, barWidth - 2, barHeight);
      }
    };

    draw();
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [analyserNode, playing]);

  return <canvas ref={canvasRef} width={400} height={70} className="w-full rounded-lg border border-border bg-card/50" />;
}