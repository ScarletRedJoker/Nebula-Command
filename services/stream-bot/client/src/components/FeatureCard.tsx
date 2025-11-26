import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LucideIcon } from "lucide-react";

interface FeatureCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  badge?: string;
  badgeVariant?: "default" | "secondary" | "destructive" | "outline";
  action?: {
    label: string;
    onClick: () => void;
  };
  iconColor?: string;
}

export function FeatureCard({
  icon: Icon,
  title,
  description,
  badge,
  badgeVariant = "secondary",
  action,
  iconColor = "text-primary",
}: FeatureCardProps) {
  return (
    <Card className="candy-glass-card candy-hover-elevate">
      <CardHeader className="p-3 sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="p-1.5 sm:p-2 rounded-lg bg-muted flex-shrink-0">
              <Icon className={`h-4 w-4 sm:h-5 sm:w-5 ${iconColor}`} />
            </div>
            <CardTitle className="text-xs sm:text-base truncate">{title}</CardTitle>
          </div>
          {badge && <Badge variant={badgeVariant} className="text-[10px] sm:text-xs flex-shrink-0">{badge}</Badge>}
        </div>
        <CardDescription className="text-[10px] sm:text-sm line-clamp-2 mt-1.5 sm:mt-2">
          {description}
        </CardDescription>
      </CardHeader>
      {action && (
        <CardContent className="p-3 sm:p-4 pt-0">
          <Button variant="outline" size="sm" onClick={action.onClick} className="w-full h-8 sm:h-9 text-xs sm:text-sm candy-touch-target">
            {action.label}
          </Button>
        </CardContent>
      )}
    </Card>
  );
}
