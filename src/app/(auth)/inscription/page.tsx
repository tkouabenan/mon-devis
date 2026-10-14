import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { RegisterForm } from '@/components/auth/register-form';

export const metadata: Metadata = {
  title: 'Créer un compte',
  description:
    'Créez votre compte MON DEVIS gratuitement et générez votre premier devis professionnel en moins de 3 minutes.',
};

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const session = await getSession();
  if (session) redirect('/tableau-de-bord');

  const params = await searchParams;
  return <RegisterForm plan={params.plan} />;
}
