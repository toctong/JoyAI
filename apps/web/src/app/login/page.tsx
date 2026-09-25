import { redirect } from "next/navigation";

/** Legacy `/login` → `/frame-rally`. */
export default function LoginRedirectPage() {
  redirect("/frame-rally");
}
