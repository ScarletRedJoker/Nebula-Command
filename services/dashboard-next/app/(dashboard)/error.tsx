'use client';

import { useEffect } from 'react';
import { AlertCircle, RefreshCw, Home, ChevronDown, ChevronUp, Bug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useState } from 'react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function DashboardError({ error, reset }: ErrorProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  useEffect(() => {
    console.error('[DashboardError] Page error occurred:', {
      message: error.message,
      digest: error.digest,
      name: error.name,
      timestamp: new Date().toISOString(),
    });

    try {
      fetch('/api/errors/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'dashboard_error',
          message: error.message,
          digest: error.digest,
          url: typeof window !== 'undefined' ? window.location.href : undefined,
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
          timestamp: new Date().toISOString(),
        }),
      }).catch((logError) => {
        console.error('[ErrorBoundary] Failed to log error to server:', logError);
      });
    } catch (logError) {
      console.error('[ErrorBoundary] Failed to send error log:', logError);
    }
  }, [error]);

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      reset();
    } finally {
      setIsRetrying(false);
    }
  };

  const isProduction = process.env.NODE_ENV === 'production';
  const errorId = error.digest || `dashboard-${Date.now()}`;

  const getErrorGuidance = () => {
    const message = error.message.toLowerCase();
    
    if (message.includes('fetch') || message.includes('network')) {
      return {
        title: 'Connection Issue',
        description: 'Unable to connect to the server. This could be a temporary network issue.',
        suggestions: [
          'Check your internet connection',
          'The server may be temporarily unavailable',
          'Try refreshing the page in a few moments',
        ],
      };
    }
    
    if (message.includes('unauthorized') || message.includes('401')) {
      return {
        title: 'Session Expired',
        description: 'Your session has expired or you need to log in again.',
        suggestions: [
          'Click the button below to log in again',
          'If the issue persists, clear your browser cookies',
        ],
        action: { label: 'Log In', href: '/login' },
      };
    }
    
    if (message.includes('not found') || message.includes('404')) {
      return {
        title: 'Page Not Found',
        description: 'The requested resource could not be found.',
        suggestions: [
          'The page may have been moved or deleted',
          'Check the URL for typos',
        ],
        action: { label: 'Go to Dashboard', href: '/' },
      };
    }
    
    if (message.includes('ai') || message.includes('ollama') || message.includes('openai')) {
      return {
        title: 'AI Service Issue',
        description: 'There was a problem connecting to the AI service.',
        suggestions: [
          'Check if the AI service is running',
          'Verify your AI configuration in settings',
          'The service may be temporarily unavailable',
        ],
        action: { label: 'Check AI Health', href: '/ai-health' },
      };
    }
    
    return {
      title: 'Unexpected Error',
      description: 'Something went wrong while loading this page.',
      suggestions: [
        'Try refreshing the page',
        'If the problem persists, contact support',
      ],
    };
  };

  const guidance = getErrorGuidance();

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-4">
      <Card className="max-w-lg w-full border-destructive/20 bg-destructive/5">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 inline-flex items-center justify-center w-14 h-14 rounded-full bg-destructive/10">
            <AlertCircle className="w-7 h-7 text-destructive" />
          </div>
          <CardTitle className="text-xl">{guidance.title}</CardTitle>
        </CardHeader>
        
        <CardContent className="space-y-4">
          <p className="text-center text-muted-foreground">
            {guidance.description}
          </p>

          {guidance.suggestions && guidance.suggestions.length > 0 && (
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-sm font-medium mb-2">What you can try:</p>
              <ul className="text-sm text-muted-foreground space-y-1">
                {guidance.suggestions.map((suggestion, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <span className="text-muted-foreground/50">•</span>
                    {suggestion}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
            <Button
              onClick={handleRetry}
              disabled={isRetrying}
              className="min-w-[120px]"
            >
              {isRetrying ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Try Again
            </Button>
            
            {guidance.action ? (
              <Button variant="outline" asChild className="min-w-[120px]">
                <a href={guidance.action.href}>{guidance.action.label}</a>
              </Button>
            ) : (
              <Button variant="outline" asChild className="min-w-[120px]">
                <a href="/">
                  <Home className="w-4 h-4 mr-2" />
                  Dashboard
                </a>
              </Button>
            )}
          </div>

          {!isProduction && (
            <div className="pt-4 border-t">
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
              >
                <Bug className="w-3 h-3" />
                {showDetails ? (
                  <>
                    Hide developer details
                    <ChevronUp className="w-3 h-3" />
                  </>
                ) : (
                  <>
                    Show developer details
                    <ChevronDown className="w-3 h-3" />
                  </>
                )}
              </button>
              
              {showDetails && (
                <div className="mt-3 bg-muted rounded-lg p-3">
                  <div className="text-xs space-y-2">
                    <div>
                      <span className="font-medium">Error:</span>{' '}
                      <span className="text-muted-foreground">{error.name}</span>
                    </div>
                    <div>
                      <span className="font-medium">Message:</span>{' '}
                      <span className="text-muted-foreground">{error.message}</span>
                    </div>
                    {error.stack && (
                      <div>
                        <span className="font-medium">Stack:</span>
                        <pre className="mt-1 text-muted-foreground overflow-x-auto whitespace-pre-wrap text-[10px] bg-background/50 p-2 rounded">
                          {error.stack}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <p className="text-center text-xs text-muted-foreground pt-2">
            Error ID: {errorId}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
