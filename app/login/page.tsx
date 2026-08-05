"use client";

import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { loginSchema, type LoginInput } from "@/modules/auth/schema/auth.schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { queryKeys } from "@/lib/api/query-keys";

// A small, purpose-drawn mark (no stock "cash register" icon in lucide-react)
// standing in for the product's own logo — a POS terminal: screen + keypad.
function PosMachineIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="4" y="2" width="16" height="20" rx="3" />
      <rect x="7" y="5" width="10" height="6" rx="1" />
      <line x1="7.5" y1="14.5" x2="9.5" y2="14.5" />
      <line x1="11" y1="14.5" x2="13" y2="14.5" />
      <line x1="14.5" y1="14.5" x2="16.5" y2="14.5" />
      <line x1="7.5" y1="17.5" x2="9.5" y2="17.5" />
      <line x1="11" y1="17.5" x2="13" y2="17.5" />
      <line x1="14.5" y1="17.5" x2="16.5" y2="17.5" />
    </svg>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { tenantCode: "", email: "", password: "" },
  });

  const onSubmit = async (values: LoginInput) => {
    setFormError(null);
    // Talks to /api/session/login (sets httpOnly cookies), never
    // /api/proxy/v1/auth/login — there's no session yet to translate.
    const response = await fetch("/api/session/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const json = await response.json();
    if (!json.success) {
      setFormError(json.error?.message ?? "Login failed");
      return;
    }

    await queryClient.invalidateQueries({ queryKey: queryKeys.me });
    const next = searchParams.get("next") ?? "/";
    router.push(next);
    router.refresh();
  };

  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-muted/30 p-4">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -right-32 -bottom-32 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            <PosMachineIcon className="h-7 w-7" />
          </div>
          <div className="space-y-1">
            <h1 className="font-heading text-xl font-semibold tracking-tight">Busyos</h1>
            <p className="text-sm text-muted-foreground">Sign in to your workspace</p>
          </div>
        </div>

        <Card className="shadow-lg shadow-black/5">
          <CardHeader>
            <CardTitle>Welcome back</CardTitle>
            <CardDescription>Enter your workspace details to continue</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="tenantCode">Tenant code</Label>
                <div className="relative">
                  <Building2 className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input id="tenantCode" placeholder="demo" className="pl-8" {...form.register("tenantCode")} />
                </div>
                {form.formState.errors.tenantCode && (
                  <p className="text-sm text-destructive">{form.formState.errors.tenantCode.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="admin@demo.test"
                    className="pl-8"
                    {...form.register("email")}
                  />
                </div>
                {form.formState.errors.email && (
                  <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    className="pr-8 pl-8"
                    {...form.register("password")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                </div>
                {form.formState.errors.password && (
                  <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>
                )}
              </div>
              {formError && <p className="text-sm text-destructive">{formError}</p>}
              <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Multi-tenant inventory, purchase &amp; sales platform
        </p>
      </div>
    </div>
  );
}
