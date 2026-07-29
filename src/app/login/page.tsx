import { Suspense } from 'react';
import { LoginForm } from './login-form';

export default function LoginPage() {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Visual side */}
      <div className="hidden flex-col justify-between bg-gradient-to-br from-primary to-primary/70 p-12 text-primary-foreground lg:flex">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <span className="rounded-md bg-white/15 px-2 py-1 text-sm">Store Point</span>
          <span>Resilient store ops</span>
        </div>
        <div className="space-y-4">
          <h2 className="text-3xl font-bold leading-tight">
            Sell. Track stock. See your numbers.<br />Even when the internet is down.
          </h2>
          <p className="max-w-md text-primary-foreground/80">
            Every sale, refund and stock movement is recorded locally first and pushed to the cloud
            automatically when connectivity is back. Your shop never stops.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-4 pt-8 text-sm">
          <Stat title="Offline-first" desc="Works without internet" />
          <Stat title="Multi-store" desc="Run many shops from one account" />
          <Stat title="Role-based" desc="Everyone sees what they need" />
        </div>
      </div>

      {/* Form side */}
      <div className="flex items-center justify-center bg-background p-6 sm:p-12">
        <div className="w-full max-w-md space-y-8">
          <div className="space-y-2 text-center">
            <h1 className="text-3xl font-bold tracking-tight">Welcome back</h1>
            <p className="text-sm text-muted-foreground">Sign in to your store to continue.</p>
          </div>
          <Suspense fallback={<div className="h-72 w-full max-w-md rounded-lg bg-muted/30" />}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

function Stat({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-md bg-white/10 p-3 backdrop-blur-sm">
      <div className="font-semibold">{title}</div>
      <div className="text-primary-foreground/80">{desc}</div>
    </div>
  );
}
