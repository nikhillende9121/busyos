"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-md border bg-muted/30 p-3 text-xs leading-relaxed">
      <code>{children}</code>
    </pre>
  );
}

function InlineCode({ children }: { children: string }) {
  return <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{children}</code>;
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4 text-sm leading-relaxed">{children}</CardContent>
    </Card>
  );
}

const EVENT_ROWS = [
  {
    type: "PRODUCT_CREATED",
    fires: "A product is created.",
    payload: "The full product record.",
  },
  {
    type: "PRODUCT_UPDATED",
    fires: "A product is edited.",
    payload: "The full product record, post-edit.",
  },
  {
    type: "PRODUCT_DELETED",
    fires: "A product is deleted.",
    payload: "Just its id — nothing else.",
  },
  {
    type: "PRICE_LIST_CREATED",
    fires: "A new price list is created.",
    payload: "The full price list, including its line items.",
  },
  {
    type: "DISCOUNT_CREATED",
    fires: "A new discount is created.",
    payload: "The full discount definition.",
  },
  {
    type: "COUPON_CREATED",
    fires: "A new coupon is created.",
    payload: "The full coupon definition (code, value, limits, dates).",
  },
];

const API_ROWS = [
  {
    method: "GET",
    path: "/api/v1/webhooks/integration",
    auth: "Dashboard session",
    purpose: "View your API key and integration settings.",
  },
  {
    method: "POST",
    path: "/api/v1/webhooks/integration",
    auth: "Dashboard session",
    purpose: "Create your integration credentials (one-time, first setup).",
  },
  {
    method: "PUT",
    path: "/api/v1/webhooks/integration",
    auth: "Dashboard session",
    purpose: "Update the default online warehouse, or enable/disable the whole integration.",
  },
  {
    method: "POST",
    path: "/api/v1/webhooks/integration/regenerate",
    auth: "Dashboard session",
    purpose: "Rotate your API secret. The old one stops working immediately.",
  },
  {
    method: "GET",
    path: "/api/v1/webhooks",
    auth: "Dashboard session",
    purpose: "List your registered webhook endpoints.",
  },
  {
    method: "POST",
    path: "/api/v1/webhooks",
    auth: "Dashboard session",
    purpose: "Register a new outbound webhook endpoint (URL + event types).",
  },
  {
    method: "PUT",
    path: "/api/v1/webhooks/{id}",
    auth: "Dashboard session",
    purpose: "Update an endpoint's URL, subscribed events, or active state.",
  },
  {
    method: "DELETE",
    path: "/api/v1/webhooks/{id}",
    auth: "Dashboard session",
    purpose: "Remove a webhook endpoint.",
  },
  {
    method: "POST",
    path: "/api/v1/webhooks/{id}/test",
    auth: "Dashboard session",
    purpose: "Send a synthetic test event to verify your receiving server is reachable.",
  },
  {
    method: "GET",
    path: "/api/v1/webhooks/{id}/deliveries",
    auth: "Dashboard session",
    purpose: "View the delivery history (status, attempts, HTTP code) for one endpoint.",
  },
  {
    method: "POST",
    path: "/api/v1/integrations/orders",
    auth: "API Key + Signature (no login)",
    purpose: "Your website's own backend calls this directly to create a sale.",
  },
];

export default function WebhooksGuidePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-16">
      <div>
        <Link
          href="/webhooks"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to Webhooks
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-semibold font-heading">Webhook Integration Guide</h1>
        <p className="text-muted-foreground">
          Everything you need to connect your own website to this platform: receiving orders, and staying in
          sync with your catalog, pricing, and promotions.
        </p>
      </div>

      <Section title="Two directions, one integration">
        <p>
          "Webhooks" here actually covers two separate, independent flows, both gated by the same integration
          credentials:
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border p-3">
            <p className="font-medium text-foreground">Outbound — we notify you</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Whenever a product, price list, discount, or coupon changes here, we POST an event payload to
              URL(s) you register, so your website can keep its own catalog/pricing display up to date.
            </p>
          </div>
          <div className="rounded-md border p-3">
            <p className="font-medium text-foreground">Inbound — you send us orders</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Your website's own backend calls one endpoint directly, authenticated with your API key, to
              create a real sale here — inventory decrements and it shows up in Sales exactly like a POS
              order.
            </p>
          </div>
        </div>
      </Section>

      <Section title="1. Get your credentials" description="From the Webhooks page, before anything else.">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Go to <Link href="/webhooks" className="underline underline-offset-2">Webhooks</Link> and click{" "}
            <span className="font-medium text-foreground">"Create integration"</span> under Integration
            credentials.
          </li>
          <li>
            You'll get an <span className="font-medium text-foreground">API Key</span> (safe to keep visible —
            it identifies your integration) and an{" "}
            <span className="font-medium text-foreground">API Secret</span>, shown exactly once. Copy it
            somewhere safe immediately — there is no way to view it again, only regenerate a new one (which
            immediately invalidates the old one).
          </li>
          <li>
            Set your <span className="font-medium text-foreground">default online warehouse</span> — this is
            the store/warehouse an inbound order's stock is drawn from and priced against.
          </li>
        </ol>
      </Section>

      <Section
        title="2. Outbound webhooks — get notified of changes"
        description="Register a URL, pick which events it should receive."
      >
        <p>
          From the Webhooks page, click <span className="font-medium text-foreground">"Add webhook"</span>,
          enter your receiving URL (must be <InlineCode>https://</InlineCode>), and choose one or more event
          types. You'll be shown a <span className="font-medium text-foreground">signing secret</span> once —
          this is per-endpoint, different from your API secret, and used to verify a delivery really came from
          us.
        </p>

        <div>
          <p className="mb-2 font-medium text-foreground">Supported events</p>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event type</TableHead>
                  <TableHead>Fires when…</TableHead>
                  <TableHead>Payload contains</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {EVENT_ROWS.map((row) => (
                  <TableRow key={row.type}>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-[11px]">
                        {row.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{row.fires}</TableCell>
                    <TableCell className="text-xs">{row.payload}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Update/delete events for price lists, discounts, and coupons, plus a stock-level event, are
            reserved for a future release and aren't selectable yet.
          </p>
        </div>

        <div>
          <p className="mb-2 font-medium text-foreground">What we send</p>
          <p className="mb-2">
            A plain <InlineCode>POST</InlineCode> with a JSON body that <span className="font-medium text-foreground">is</span> the
            resource itself — there's no wrapper/envelope and no event-type field in the body. If one endpoint
            is subscribed to more than one event type, tell them apart by the payload's shape (a product has{" "}
            <InlineCode>sku</InlineCode>, a coupon has <InlineCode>code</InlineCode>, a price list has{" "}
            <InlineCode>items[]</InlineCode>, and so on).
          </p>
          <Code>{`POST https://your-site.example/webhook
Content-Type: application/json
X-Webhook-Signature: sha256=6f1e2c...

{
  "id": "128",
  "sku": "RICE-5KG",
  "barcode": "8901234567890",
  "name": "Basmati Rice 5kg",
  "status": "ACTIVE",
  "categoryId": "12",
  "brandId": "4",
  "unitId": "2",
  "taxRateId": "7",
  "trackBatches": false,
  "images": [],
  "createdAt": "2026-09-01T10:15:00.000Z",
  "updatedAt": "2026-09-01T10:15:00.000Z"
}`}</Code>
        </div>

        <div>
          <p className="mb-2 font-medium text-foreground">Verifying the signature</p>
          <p className="mb-2">
            <InlineCode>X-Webhook-Signature</InlineCode> is <InlineCode>sha256=&lt;hex&gt;</InlineCode> — an
            HMAC-SHA256 of the exact raw request body, keyed with that endpoint's signing secret. Compute the
            same HMAC yourself and compare:
          </p>
          <Code>{`const crypto = require("crypto");

function isValid(rawBody, signatureHeader, signingSecret) {
  const expected = crypto
    .createHmac("sha256", signingSecret)
    .update(rawBody) // the raw request body, not JSON.parse'd and re-stringified
    .digest("hex");
  const provided = signatureHeader.replace(/^sha256=/, "");
  return crypto.timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(expected, "hex"));
}`}</Code>
        </div>

        <div>
          <p className="mb-2 font-medium text-foreground">Delivery, retries &amp; testing</p>
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            <li>We attempt delivery immediately, and expect a <InlineCode>2xx</InlineCode> response within 10 seconds.</li>
            <li>
              A failure (non-2xx, timeout, or connection error) retries at +1 minute, +5 minutes, +30 minutes,
              then +2 hours — five attempts total, then it's marked permanently failed (visible in the
              endpoint's delivery log, never silently dropped).
            </li>
            <li>
              Retries are drained by a periodic job, not instantly — a delivery due for retry may sit for a
              few minutes before the next attempt actually fires.
            </li>
            <li>
              Use <span className="font-medium text-foreground">"Send test"</span> on any endpoint to fire a
              synthetic event immediately and confirm your server is reachable and your signature check passes
              — the test payload is always a fixed sample product update, regardless of which events that
              endpoint is actually subscribed to.
            </li>
          </ul>
        </div>
      </Section>

      <Section
        title="3. Inbound orders — send us a sale from your website"
        description="POST /api/v1/integrations/orders — called directly by your website's backend, no dashboard login involved."
      >
        <div>
          <p className="mb-2 font-medium text-foreground">Headers</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Header</TableHead>
                <TableHead>Required</TableHead>
                <TableHead>Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell><InlineCode>X-Api-Key</InlineCode></TableCell>
                <TableCell className="text-xs">Yes</TableCell>
                <TableCell className="text-xs">Your API key</TableCell>
              </TableRow>
              <TableRow>
                <TableCell><InlineCode>X-Signature</InlineCode></TableCell>
                <TableCell className="text-xs">Yes</TableCell>
                <TableCell className="text-xs">
                  <InlineCode>sha256=&lt;hex&gt;</InlineCode> — HMAC-SHA256 of the raw request body, keyed with
                  your API secret (same scheme as outbound, but keyed with your secret, not an endpoint's)
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell><InlineCode>Idempotency-Key</InlineCode></TableCell>
                <TableCell className="text-xs">Recommended</TableCell>
                <TableCell className="text-xs">
                  Any string you choose. Retrying the exact same request with the same key returns the
                  original result instead of creating a second sale.
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        <div>
          <p className="mb-2 font-medium text-foreground">Request body</p>
          <Code>{`{
  "externalOrderReference": "SHOP-10234",
  "customerId": "551",
  "couponCode": "WELCOME10",
  "items": [
    { "skuOrBarcode": "RICE-5KG", "quantity": "2" },
    { "skuOrBarcode": "8901234567890", "quantity": "1" }
  ]
}`}</Code>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            <li>
              <InlineCode>items[].skuOrBarcode</InlineCode> — your own SKU or barcode, not our internal
              product id (we look it up for you).
            </li>
            <li>
              <span className="font-medium text-foreground">No price is ever accepted</span> — price is always
              resolved server-side from your current price-list configuration for the default online
              warehouse, exactly like every other sales channel. If nothing prices a line item, the whole
              request fails rather than guessing.
            </li>
            <li>
              <InlineCode>customerId</InlineCode> is your own internal customer id from a previous lookup —
              required if the Customers feature is enabled on your plan, same rule as every other sale.
            </li>
            <li><InlineCode>externalOrderReference</InlineCode> and <InlineCode>couponCode</InlineCode> are both optional.</li>
          </ul>
        </div>

        <div>
          <p className="mb-2 font-medium text-foreground">Response</p>
          <p className="mb-2">
            <InlineCode>201</InlineCode> with the created sale — the same shape as every other sale in this
            system (id, computed totals, tax breakdown, items). Look it up later in Sales by its{" "}
            <InlineCode>externalOrderReference</InlineCode> to reconcile against your own order number.
          </p>
          <Code>{`{
  "success": true,
  "message": "Order received",
  "data": {
    "id": "5510",
    "saleNumber": "INV-2026-5510",
    "channel": "ONLINE",
    "status": "PENDING_PAYMENT",
    "externalOrderReference": "SHOP-10234",
    "items": [ /* ...priced, taxed line items... */ ],
    "subtotal": "1200.00",
    "taxAmount": "216.00",
    "totalAmount": "1416.00",
    "createdAt": "2026-09-01T10:20:00.000Z"
  }
}`}</Code>
        </div>
      </Section>

      <Section title="Full API reference">
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Method</TableHead>
                <TableHead>Endpoint</TableHead>
                <TableHead>Auth</TableHead>
                <TableHead>Purpose</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {API_ROWS.map((row) => (
                <TableRow key={`${row.method}-${row.path}`}>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-[11px]">
                      {row.method}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{row.path}</TableCell>
                  <TableCell className="text-xs">{row.auth}</TableCell>
                  <TableCell className="text-xs">{row.purpose}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground">
          Every "Dashboard session" row above is meant for managing your own integration (from this page, or
          programmatically with your own logged-in access token) — it's not what your website calls for
          day-to-day order/catalog sync. Only the last row (inbound orders) is called by your website's
          backend directly, using your API key instead of a login.
        </p>
      </Section>

      <Section title="Security notes">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Both secrets (API secret, per-endpoint signing secret) are shown exactly once. Store them in your own secrets manager, not in source control.</li>
          <li>If a secret ever leaks, regenerate it immediately — the old one stops working the instant you do, with no grace period.</li>
          <li>Webhook URLs must be publicly reachable <InlineCode>https://</InlineCode> addresses — local/private/internal network addresses are rejected, both when you register the endpoint and again at delivery time.</li>
          <li>Always verify <InlineCode>X-Webhook-Signature</InlineCode> (outbound) or send a correct <InlineCode>X-Signature</InlineCode> (inbound) — an unsigned or mis-signed request is rejected outright, never processed "unverified."</li>
        </ul>
      </Section>
    </div>
  );
}
