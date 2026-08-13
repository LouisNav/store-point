import { hasAnyUser } from '@/lib/auth/bootstrap';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SeedButton } from './seed-button';
import { env } from '@/env';
import { SetupForm } from './setup-form';

export default async function SetupPage() {
  if (await hasAnyUser()) redirect('/login');

  const envRoot = env();
  const seedAvailable = !!(envRoot.ROOT_ADMIN_EMAIL && envRoot.ROOT_ADMIN_PASSWORD);

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-12">
      <div className="mx-auto max-w-xl space-y-6">
        <header className="text-center">
          <div className="text-xs uppercase tracking-wide text-primary">Store Point · First-time setup</div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Welcome to Store Point</h1>
          <p className="mx-auto mt-2 max-w-md text-muted-foreground">
            Create your owner account and first store to get started. Everything is stored locally and works offline.
          </p>
        </header>

        <Card className="border-primary/40 shadow-md">
          <CardHeader>
            <CardTitle className="text-lg">Create your account</CardTitle>
            <CardDescription>
              Pick your currency — including any custom code and symbol — so the register works wherever you are.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SetupForm />
          </CardContent>
        </Card>

        {seedAvailable && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Prefer your .env credentials?</CardTitle>
              <CardDescription>
                A root admin is configured in your .env file ({envRoot.ROOT_ADMIN_EMAIL}).
                Create it — plus a sample store and demo products — with one click.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SeedButton available={seedAvailable} />
            </CardContent>
          </Card>
        )}

        <p className="text-center text-xs leading-relaxed text-muted-foreground">
          Prefer the terminal? Set <code>ROOT_ADMIN_EMAIL</code> and <code>ROOT_ADMIN_PASSWORD</code> in your{' '}
          <code>.env</code> and run <code>npm run seed</code>.
          <br />
          <Link href="/" className="underline">Back to home</Link>
        </p>
      </div>
    </div>
  );
}
