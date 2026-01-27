'use client';

import { useEffect } from 'react';
import { AlertCircle, RefreshCw, Home, FileText } from 'lucide-react';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error('[GlobalError] Unhandled application error:', {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
  }, [error]);

  const isProduction = process.env.NODE_ENV === 'production';
  const errorId = error.digest || `err-${Date.now()}`;

  return (
    <html lang="en">
      <body className="bg-background text-foreground">
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="max-w-md w-full text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/20 mb-6">
              <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>
            
            <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
            
            <p className="text-muted-foreground mb-6">
              An unexpected error occurred. Our team has been notified and is working to fix this issue.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center mb-6">
              <button
                onClick={reset}
                className="inline-flex items-center justify-center px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Try Again
              </button>
              
              <a
                href="/"
                className="inline-flex items-center justify-center px-4 py-2 border border-border rounded-md hover:bg-muted transition-colors"
              >
                <Home className="w-4 h-4 mr-2" />
                Go Home
              </a>
            </div>

            {!isProduction && error.message && (
              <div className="text-left bg-muted rounded-lg p-4 mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Error Details (Development Only)</span>
                </div>
                <pre className="text-xs text-muted-foreground overflow-x-auto whitespace-pre-wrap">
                  {error.message}
                  {error.stack && `\n\n${error.stack}`}
                </pre>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Error ID: {errorId}
            </p>
          </div>
        </div>
      </body>
    </html>
  );
}
