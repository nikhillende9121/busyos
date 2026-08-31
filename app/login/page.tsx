"use client";

import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { GiShoppingBag } from "react-icons/gi";
import { loginSchema, type LoginInput } from "@/modules/auth/schema/auth.schema";
import { Button } from "@/components/ui/button";
import { LoaderButton } from "@/components/ui/loader-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiClient } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import type { MeView } from "@/modules/auth/types/auth.types";

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
    defaultValues: { email: "", password: "" },
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

    // An explicit `next` (a deep link that bounced here) always wins.
    // Otherwise, a role holding STORE.ACCESS lands on the simplified store
    // view instead of the dashboard — see shared/constants/permissions.ts.
    // "/" is the public landing page, not the app — the dashboard home
    // lives at "/dashboard".
    const explicitNext = searchParams.get("next");
    let next = explicitNext ?? "/dashboard";
    if (!explicitNext) {
      // Best-effort only: this just picks /dashboard vs /store. The login
      // itself already succeeded above, so a failure here must never leave
      // the user stranded on the login page — fall back to the /dashboard
      // default and let the real, authoritative permission check happen
      // there instead.
      try {
        const me = await apiClient.get<MeView>("/auth/me");
        if (me.permissions.includes("STORE.ACCESS")) {
          next = "/store";
        }
      } catch {
        // fall through with next = "/dashboard"
      }
    }
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
            <GiShoppingBag className="h-7 w-7" />
          </div>
          <div className="space-y-1">
            <h1 className="font-heading text-xl font-semibold tracking-tight">RetailX</h1>
            <p className="text-sm text-muted-foreground">Sign in to your workspace</p>
          </div>
        </div>

        <Card className="shadow-lg shadow-black/5">
          <CardHeader>
            <CardTitle>Welcome back</CardTitle>
            <CardDescription>Enter your login credentials to continue</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@company.com"
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
              <LoaderButton type="submit" className="w-full" loading={form.formState.isSubmitting}>
                Sign in
              </LoaderButton>
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
