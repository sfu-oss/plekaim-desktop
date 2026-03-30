export default function Home() {
  return (
    <main style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0b1020',
      color: '#e2e8f0',
      fontFamily: 'Inter, system-ui, sans-serif'
    }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: 32, marginBottom: 8 }}>PleKaim Desktop</h1>
        <p style={{ opacity: 0.7 }}>Electron + Next.js scaffold ready.</p>
      </div>
    </main>
  );
}
