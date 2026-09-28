import { redirect } from "next/navigation";

/** Old URL — Plan a Day lives at /plan-a-day. */
export default function PlanRedirect() {
  redirect("/plan-a-day");
}
