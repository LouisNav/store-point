import { requireUser } from '@/lib/auth/guards';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ProfileForm } from './profile-form';

export default async function ProfilePage() {
  const session = await requireUser();
  return (
    <div>
      <PageHeader title="My profile" description="Update your account details." />
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
          <CardDescription>Signed in as {session.email}.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm initialName={session.name ?? ''} initialEmail={session.email ?? ''} />
        </CardContent>
      </Card>
    </div>
  );
}
