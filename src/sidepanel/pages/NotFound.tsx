/**
 * 404 error page component for handling non-existent routes.
 */

import { Button } from "@ui/components/ui/button";
import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname,
    );
  }, [location.pathname]);

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-background overflow-hidden">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_20%_20%,rgba(255,0,76,0.08),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(255,255,255,0.05),transparent_30%),radial-gradient(circle_at_50%_80%,rgba(255,0,76,0.06),transparent_28%)]" />
      <div className="relative text-center px-6 py-12 space-y-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Page not found
        </div>
        <div className="space-y-3">
          <h1 className="text-4xl sm:text-5xl font-black leading-tight text-foreground">
            Lost in the feed?
            <span className="block bg-gradient-to-r from-primary via-primary/80 to-white bg-clip-text text-transparent">
              404
            </span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            We couldn't find the page you're looking for. Double-check the link or head back home to continue analyzing videos.
          </p>
        </div>
        <div className="flex justify-center">
          <Button asChild size="lg" className="px-6 h-12">
            <Link to="/">Return home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
