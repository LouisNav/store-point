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
      <div className="mx-auto max-w-2xl space-y-8">
        <header>
          <div className="text-xs uppercase tracking-wide text-primary">Store Point · First-time setup</div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Welcome — let's bootstrap your server</h1>
          <p className="mt-2 text-muted-foreground">
            No users exist yet. The recommended path is to seed a root admin from your <code>.env</code> file
            (set <code>ROOT_ADMIN_EMAIL</code> and <code>ROOT_ADMIN_PASSWORD</code>, then run <code>npm run seed</code>).
            <br />Below you can also seed right here if your env is already configured.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Option 1 · Run the seed script</CardTitle>
            <CardDescription>
              In your terminal, from the project root:
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <pre className="rounded-md bg-muted p-3 font-mono text-xs">
{`# 1. Edit .env and set:
#    ROOT_ADMIN_EMAIL=you@example.com
#    ROOT_ADMIN_PASSWORD=YourStrongPass!1
# 2. Run:
npm run seed`}
            </pre>
            <p>The seed creates the root admin, a sample store, sample products, and assigns you as the manager of that store.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Option 2 · Bootstrap from .env</CardTitle>
            <CardDescription>
              {seedAvailable
                ? `Create the root admin using ${envRoot.ROOT_ADMIN_EMAIL} from your .env file.`
                : 'Add ROOT_ADMIN_EMAIL and ROOT_ADMIN_PASSWORD to your .env first.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SeedButton available={seedAvailable} />
          </CardContent>
        </Card>

        <Card className="border-primary/40 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-base">Option 3 · Bootstrap from this screen</CardTitle>
            <CardDescription>
              No .env editing required. Pick an email and password, name your first store, and you're in.
              Best for first-time installs and quick demos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SetupForm />
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Need help? See the README for the full setup guide. <Link href="/" className="underline">Back</Link>
        </p>
      </div>
    </div>
  );
}
