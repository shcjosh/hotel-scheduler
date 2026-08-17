interface PlaceholderPageProps {
  title: string
  description?: string
}

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white p-16 text-center">
      <h2 className="mb-2 text-xl font-semibold text-gray-700">{title}</h2>
      <p className="text-sm text-gray-500">
        {description ?? '此功能將在後續 Phase 實作'}
      </p>
    </div>
  )
}
