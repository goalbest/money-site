import { redirect } from "next/navigation";

export default function MonitorPage() {
  redirect("/holdings?view=monitor");
}