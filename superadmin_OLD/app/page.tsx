export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm">
        <h1 className="text-4xl font-bold mb-4">Cliniflow SuperAdmin Dashboard</h1>
        <p className="text-lg">SuperAdmin panel coming soon...</p>
        <p className="text-sm mt-4 text-gray-500">
          API URL: {process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5050'}
        </p>
        <div className="mt-8 p-4 bg-yellow-100 border border-yellow-400 rounded">
          <p className="text-sm text-yellow-800">
            <strong>Note:</strong> This panel only displays statistics and metrics.
            No patient or message content is shown.
          </p>
        </div>
      </div>
    </main>
  )
}
