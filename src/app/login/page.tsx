import { redirect } from "next/navigation";

import {
  getMapperSessionSecret,
  readMapperSession,
  safeNextPath,
} from "@/lib/auth/mapper-session";
import { LoginForm } from "./login-form";

type Props = { searchParams: Promise<{ next?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  const session = await readMapperSession();
  if (session) redirect(next);
  return (
    <LoginForm next={next} configured={Boolean(getMapperSessionSecret())} />
  );
}
