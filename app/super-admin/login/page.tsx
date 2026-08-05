"use client";

import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { superAdminLoginSchema, type SuperAdminLoginInput } from "@/modules/super-admin/schema/auth.schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function SuperAdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <SuperAdminLoginForm />
    </Suspense>
  );
}

function SuperAdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<SuperAdminLoginInput>({
    resolver: zodResolver(superAdminLoginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values: SuperAdminLoginInput) => {
    setFormError(null);
    // Talks to /api/super-admin-session/login (sets its own httpOnly
    // cookies, entirely separate from the tenant session — see proxy.ts).
    const response = await fetch("/api/super-admin-session/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const json = await response.json();
    if (!json.success) {
      setFormError(json.error?.message ?? "Login failed");
      return;
    }

    const next = searchParams.get("next") ?? "/super-admin/tenants";
    router.push(next);
    router.refresh();
  };

  return (
    <div className="flex flex-1 items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Super Admin</CardTitle>
          <CardDescription>Platform administration — not tenant-scoped.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="root@platform.test" {...form.register("email")} />
              {form.formState.errors.email && (
                <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" {...form.register("password")} />
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
    </div>
  );
}
