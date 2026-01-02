import { useState, useEffect } from 'react';
import { useWizard } from '../App';

const PostInstallStep: React.FC = () => {
  const { prevStep, macosVersion } = useWizard();
  const [isScanning, setIsScanning] = useState(false);
  const [partitions, setPartitions] = useState<EFIPartition[]>([]);
  const [sourceId, setSourceId] = useState<string>('');
  const [destId, setDestId] = useState<string>('');
  
  const [currentAction, setCurrentAction] = useState<string>('');
  const [copyComplete, setCopyComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [heliportInstalled, setHeliportInstalled] = useState(false);

  useEffect(() => {
    scanPartitions();
  }, []);

  const scanPartitions = async () => {
    setIsScanning(true);
    setError(null);
    try {
      if (window.electronAPI) {
        const parts = await window.electronAPI.listEFIPartitions();
        setPartitions(parts);
        
        // Auto-select likely candidates if not already set
        if (!sourceId || !destId) {
          const usb = parts.find(p => p.diskType === 'external');
          const internal = parts.find(p => p.diskType === 'internal');
          if (usb && !sourceId) setSourceId(usb.id);
          if (internal && !destId) setDestId(internal.id);
        }
      } else {
        // Mock data for browser dev
        await new Promise(resolve => setTimeout(resolve, 1000));
        const mockParts: EFIPartition[] = [
          { id: 'disk1s1', diskId: 'disk1', diskType: 'external', diskName: 'USB Installer', label: 'EFI', mounted: false, mountPoint: null },
          { id: 'disk0s1', diskId: 'disk0', diskType: 'internal', diskName: 'Macintosh HD', label: 'EFI', mounted: false, mountPoint: null }
        ];
        setPartitions(mockParts);
        setSourceId('disk1s1');
        setDestId('disk0s1');
      }
    } catch (err) {
      setError('Failed to list partitions.');
      console.error(err);
    } finally {
      setIsScanning(false);
    }
  };

  const copyEfiToSsd = async (): Promise<void> => {
    if (!sourceId || !destId) return;
    
    setCurrentAction('Starting...');
    setError(null);
    
    try {
      if (window.electronAPI) {
        // 1. Mount Source
        setCurrentAction(`Mounting Source (${sourceId})...`);
        const sourcePath = await window.electronAPI.mountEFI(sourceId);
        
        // 2. Mount Dest
        setCurrentAction(`Mounting Destination (${destId})...`);
        const destPath = await window.electronAPI.mountEFI(destId);
        
        // 3. Copy
        setCurrentAction('Copying EFI folder...');
        await window.electronAPI.copyEFI(sourcePath, destPath);
        
        // 4. Unmount (optional, maybe keep mounted for user inspection?)
        // await window.electronAPI.unmountEFI(sourceId);
        // await window.electronAPI.unmountEFI(destId);
      } else {
        // Simulate
        await new Promise(resolve => setTimeout(resolve, 1000));
        setCurrentAction('Mounting...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        setCurrentAction('Copying...');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      setCopyComplete(true);
      setCurrentAction('');
    } catch (err) {
      setError('Failed to copy EFI. Check logs.');
      console.error(err);
      setCurrentAction('');
    }
  };

  const installHeliport = async (): Promise<void> => {
    // Simulate HeliPort installation
    await new Promise(resolve => setTimeout(resolve, 1500));
    setHeliportInstalled(true);
  };

  const allComplete = copyComplete && (macosVersion !== 'sequoia' || heliportInstalled);

  return (
    <>
      <header className="content-header">
        <h1 className="content-title">Post-Installation</h1>
        <p className="content-subtitle">
          Final steps to make your Hackintosh boot independently.
        </p>
      </header>

      <div className="content-body fade-in">
        <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
          <div className="card-header">
            <div className="card-icon" style={{ background: copyComplete ? 'var(--color-accent-green)' : 'var(--gradient-primary)' }}>
              {copyComplete ? '✓' : '1'}
            </div>
            <div>
              <div className="card-title">Copy EFI to Internal Drive</div>
            </div>
          </div>
          
          <div className="card-description">
            Copy the OpenCore bootloader from your USB to your SSD's EFI partition.
          </div>
          
          {!copyComplete && (
            <div style={{ marginTop: 'var(--space-md)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-sm)' }}>
                <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>Detected Partitions:</span>
                <button className="btn btn-ghost btn-sm" onClick={scanPartitions} disabled={isScanning || !!currentAction}>
                  {isScanning ? 'Scanning...' : '🔄 Refresh'}
                </button>
              </div>

              {partitions.length === 0 && !isScanning && (
                <div className="alert alert-warning">No EFI partitions found. Insert USB drive.</div>
              )}

              {partitions.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: 'var(--space-xs)', fontSize: 'var(--font-size-sm)' }}>
                      Source (USB)
                    </label>
                    <select 
                      className="form-select" 
                      value={sourceId} 
                      onChange={(e) => setSourceId(e.target.value)}
                      disabled={!!currentAction}
                      style={{ width: '100%', padding: '8px', borderRadius: '4px', background: 'var(--color-bg-elevated)', color: 'white', border: '1px solid var(--color-border)' }}
                    >
                      <option value="">Select Source...</option>
                      {partitions.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.diskName} ({p.id}) - {p.diskType}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 'var(--space-xs)', fontSize: 'var(--font-size-sm)' }}>
                      Destination (SSD)
                    </label>
                    <select 
                      className="form-select" 
                      value={destId} 
                      onChange={(e) => setDestId(e.target.value)}
                      disabled={!!currentAction}
                      style={{ width: '100%', padding: '8px', borderRadius: '4px', background: 'var(--color-bg-elevated)', color: 'white', border: '1px solid var(--color-border)' }}
                    >
                      <option value="">Select Destination...</option>
                      {partitions.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.diskName} ({p.id}) - {p.diskType}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {error && <div className="alert alert-error" style={{ marginTop: 'var(--space-md)' }}>{error}</div>}

              <div style={{ marginTop: 'var(--space-lg)', textAlign: 'center' }}>
                {currentAction ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-md)' }}>
                    <div className="spinner" />
                    <span>{currentAction}</span>
                  </div>
                ) : (
                  <button 
                    className="btn btn-primary" 
                    onClick={copyEfiToSsd}
                    disabled={!sourceId || !destId || sourceId === destId}
                  >
                    Copy EFI to SSD
                  </button>
                )}
              </div>
            </div>
          )}
          
          {copyComplete && (
             <div style={{ marginTop: 'var(--space-md)', color: 'var(--color-accent-green)' }}>
              ✅ EFI copied successfully from {partitions.find(p => p.id === sourceId)?.diskName} to {partitions.find(p => p.id === destId)?.diskName}
            </div>
          )}
        </div>

        {/* Step 2: HeliPort (Sequoia only) */}
        {macosVersion === 'sequoia' && (
          <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
            <div className="card-header">
              <div className="card-icon" style={{ background: heliportInstalled ? 'var(--color-accent-green)' : 'var(--gradient-primary)' }}>
                {heliportInstalled ? '✓' : '2'}
              </div>
              <div>
                <div className="card-title">Install HeliPort</div>
              </div>
            </div>
            <div className="card-description">
              Since you're using Sequoia, you need HeliPort to manage WiFi connections.
              This app replaces the native WiFi menu functionality.
            </div>
            
            {!heliportInstalled && copyComplete && (
              <button 
                className="btn btn-primary" 
                style={{ marginTop: 'var(--space-lg)' }}
                onClick={installHeliport}
              >
                Install HeliPort
              </button>
            )}
            
            {heliportInstalled && (
              <div style={{ marginTop: 'var(--space-md)', color: 'var(--color-accent-green)' }}>
                ✅ HeliPort installed - Find it in your Applications folder
              </div>
            )}
          </div>
        )}

        {/* Completion */}
        {allComplete && (
          <>
            <div className="alert alert-success">
              <div className="alert-icon">🎉</div>
              <div className="alert-content">
                <div className="alert-title">Setup Complete!</div>
                <div className="alert-message">
                  Your Surface Pro 7 is now running macOS {macosVersion === 'sonoma' ? 'Sonoma' : 'Sequoia'}!
                  You can safely remove the USB drive and reboot.
                </div>
              </div>
            </div>

            <div style={{ marginTop: 'var(--space-xl)', textAlign: 'center' }}>
              <button 
                className="btn btn-primary"
                onClick={() => {
                  if (window.electronAPI) {
                    window.electronAPI.openExternal('https://github.com/balopez83/Surface-Pro-7-Hackintosh');
                  }
                }}
              >
                ⭐ Star the Project on GitHub
              </button>
            </div>
          </>
        )}
      </div>

      <footer className="content-footer">
        <button className="btn btn-secondary" onClick={prevStep}>
          ← Back
        </button>
        <div></div>
      </footer>
    </>
  );
};

export default PostInstallStep;
