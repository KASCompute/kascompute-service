import { cn } from "@/lib/utils";
import { Check, AlertCircle, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forwardRef } from "react";

type ValidationState = "valid" | "invalid" | "warning" | "none";

interface ValidatedInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  validationState?: ValidationState;
  validationMessage?: string;
  hint?: string;
}

export const ValidatedInput = forwardRef<HTMLInputElement, ValidatedInputProps>(
  ({ label, validationState = "none", validationMessage, hint, className, id, ...props }, ref) => {
    const inputId = id || label.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="space-y-2">
        <Label htmlFor={inputId} className="text-sm font-medium text-foreground">
          {label}
        </Label>
        <div className="relative">
          <Input
            ref={ref}
            id={inputId}
            className={cn(
              "pr-10 bg-input border-border/50 focus:border-primary transition-colors",
              validationState === "valid" && "border-success focus:border-success",
              validationState === "invalid" && "border-destructive focus:border-destructive",
              validationState === "warning" && "border-warning focus:border-warning",
              className
            )}
            {...props}
          />
          {validationState !== "none" && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {validationState === "valid" && (
                <Check className="h-4 w-4 text-success" />
              )}
              {validationState === "invalid" && (
                <X className="h-4 w-4 text-destructive" />
              )}
              {validationState === "warning" && (
                <AlertCircle className="h-4 w-4 text-warning" />
              )}
            </div>
          )}
        </div>
        {hint && !validationMessage && (
          <p className="text-xs text-muted-foreground">{hint}</p>
        )}
        {validationMessage && (
          <p
            className={cn(
              "text-xs",
              validationState === "valid" && "text-success",
              validationState === "invalid" && "text-destructive",
              validationState === "warning" && "text-warning"
            )}
          >
            {validationMessage}
          </p>
        )}
      </div>
    );
  }
);

ValidatedInput.displayName = "ValidatedInput";
