import { redirect } from "next/navigation";

// /store has nothing of its own to show — Sales is the natural landing
// spot for a day-to-day store workflow.
export default function StoreHomePage() {
  redirect("/store/sales");
}
