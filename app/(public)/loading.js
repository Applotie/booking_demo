import { PageLoading } from '@/components/ui/ActivityIndicator';

// Shown while a page of the booking site is being opened.
export default function PublicLoading() {
  return <PageLoading label="Loading…" className="px-4 py-16" />;
}
