import * as React from "react";
import { AlertCircle, RefreshCw, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface ErrorCardProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  isRetrying?: boolean;
  showContactSupport?: boolean;
  contactSupportUrl?: string;
  technicalDetails?: string;
  className?: string;
  variant?: "default" | "inline" | "compact";
}

export function ErrorCard({
  title = "Something went wrong",
  message,
  onRetry,
  retryLabel = "Try Again",
  isRetrying = false,
  showContactSupport = false,
  contactSupportUrl,
  technicalDetails,
  className,
  variant = "default",
}: ErrorCardProps) {
  const [showDetails, setShowDetails] = React.useState(false);

  if (variant === "compact") {
    return (
      <div
        className={cn(
          "flex items-center gap-3 p-3 rounded-lg border border-destructive/20 bg-destructive/5",
          className
        )}
      >
        <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
        <p className="text-sm text-destructive flex-1">{message}</p>
        {onRetry && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRetry}
            disabled={isRetrying}
            className="h-7 px-2 text-xs"
          >
            {isRetrying ? (
              <RefreshCw className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
          </Button>
        )}
      </div>
    );
  }

  if (variant === "inline") {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center py-8 text-center",
          className
        )}
      >
        <div className="rounded-full bg-destructive/10 p-3 mb-4">
          <AlertCircle className="h-6 w-6 text-destructive" />
        </div>
        <h3 className="font-semibold text-lg mb-1">{title}</h3>
        <p className="text-sm text-muted-foreground mb-4 max-w-sm">{message}</p>
        <div className="flex items-center gap-2">
          {onRetry && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              disabled={isRetrying}
            >
              {isRetrying ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              {retryLabel}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <Card className={cn("border-destructive/20 bg-destructive/5", className)}>
      <CardContent className="flex flex-col items-center justify-center py-8 sm:py-12 text-center">
        <div className="rounded-full bg-destructive/10 p-3 sm:p-4 mb-4">
          <AlertCircle className="h-6 w-6 sm:h-8 sm:w-8 text-destructive" />
        </div>
        <h3 className="font-semibold text-lg sm:text-xl mb-2">{title}</h3>
        <p className="text-sm sm:text-base text-muted-foreground mb-6 max-w-md px-4">
          {message}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
          {onRetry && (
            <Button
              variant="default"
              size="sm"
              onClick={onRetry}
              disabled={isRetrying}
              className="min-w-[120px]"
            >
              {isRetrying ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              {retryLabel}
            </Button>
          )}
          {showContactSupport && (
            <Button
              variant="outline"
              size="sm"
              asChild
              className="min-w-[120px]"
            >
              <a
                href={contactSupportUrl || "mailto:support@example.com"}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Contact Support
              </a>
            </Button>
          )}
        </div>
        {technicalDetails && (
          <div className="mt-4 w-full max-w-md">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mx-auto"
            >
              {showDetails ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
              {showDetails ? "Hide details" : "View details"}
            </button>
            {showDetails && (
              <pre className="mt-2 p-3 rounded-md bg-muted text-xs text-left overflow-x-auto whitespace-pre-wrap break-words">
                {technicalDetails}
              </pre>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ErrorCard;
