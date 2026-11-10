import { PageLoading } from '@/components/ui/ActivityIndicator';

// Shown while an admin page is being opened.
export default function AdminLoading() {
  return <PageLoading label="Loading…" />;
}
