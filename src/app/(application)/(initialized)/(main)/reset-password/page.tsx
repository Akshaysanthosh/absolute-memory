import { ResetPassword } from '@/components/reset-password';
export const metadata = { title: 'Reset password · Absolute Memory' };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <main className="account-recovery">
      <ResetPassword token={token} />
    </main>
  );
}
