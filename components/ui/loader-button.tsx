"use client";

import { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";

/**
 * A Button that shows a spinning loader icon when `loading` is true.
 * Automatically disables itself during loading to prevent double-submits.
 * Drop-in replacement for `<Button disabled={isSubmitting}>`.
 */
export const LoaderButton = forwardRef<HTMLButtonElement, ButtonProps & { loading?: boolean }>(
  ({ loading = false, disabled, children, ...props }, ref) => (
    <Button ref={ref} disabled={loading || disabled} {...props}>
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </Button>
  ),
);
LoaderButton.displayName = "LoaderButton";
