export default function Loading() {
  return (
    <div className="space-y-6 py-4" aria-busy="true" aria-label="불러오는 중">
      <div className="h-40 animate-pulse rounded-2xl bg-blush" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-md border border-line bg-card">
            <div className="aspect-square animate-pulse bg-blush" />
            <div className="space-y-2 p-3">
              <div className="h-3 w-3/4 animate-pulse rounded bg-blush" />
              <div className="h-5 w-1/2 animate-pulse rounded bg-blush" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
