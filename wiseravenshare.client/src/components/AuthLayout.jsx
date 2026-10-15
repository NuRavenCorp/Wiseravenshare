import React from "react";
import { Image } from "@/components/ui/image";

const BRAND_LOGO = "https://media.apiClient.com/images/public/6acad64c240f9153977f3360/3ebcc8cb3_AwiseravenwearingglassesdesignedasalogoinPNGformat.png";

export default function AuthLayout({ icon: Icon, title, subtitle, footer, children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full overflow-hidden border-2 border-primary/30 mb-4 mx-auto">
            <Image src={BRAND_LOGO} alt="WiseRavenShare" className="w-full h-full" fittingType="fill" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
          {subtitle && <p className="text-muted-foreground mt-2">{subtitle}</p>}
        </div>
        <div className="bg-card rounded-2xl shadow-sm border border-border p-8">
          {children}
        </div>
        {footer && (
          <p className="text-center text-sm text-muted-foreground mt-6">{footer}</p>
        )}
      </div>
    </div>
  );
}