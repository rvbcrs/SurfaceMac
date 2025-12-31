import { useState } from 'react';
import { useWizard } from '../App';

const PostInstallStep: React.FC = () => {
  const { prevStep, macosVersion } = useWizard();
  const [isCopying, setIsCopying] = useState(false);
  const [copyComplete, setCopyComplete] = useState(false);
  const [heliportInstalled, setHeliportInstalled] = useState(false);

  const copyEfiToSsd = async (): Promise<void> => {
    setIsCopying(true);
    
    // Simulate EFI copy
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // In real implementation:
    // if (window.electronAPI) {
    //   await window.electronAPI.mountEFI('/dev/disk0'); // SSD
    //   await window.electronAPI.copyEFI('/Volumes/EFI_USB', '/Volumes/EFI_SSD');
    // }
    
    setIsCopying(false);
    setCopyComplete(true);
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
        {/* Step 1: Copy EFI */}
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
            This copies the OpenCore bootloader from your USB to your SSD's EFI partition,
            allowing your Surface to boot macOS without the USB drive.
          </div>
          
          {!copyComplete && (
            <div style={{ marginTop: 'var(--space-lg)' }}>
              {isCopying ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                  <div className="spinner" />
                  <span>Mounting EFI partitions and copying files...</span>
                </div>
              ) : (
                <button className="btn btn-primary" onClick={copyEfiToSsd}>
                  Copy EFI to SSD
                </button>
              )}
            </div>
          )}
          
          {copyComplete && (
            <div style={{ marginTop: 'var(--space-md)', color: 'var(--color-accent-green)' }}>
              ✅ EFI copied successfully
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

            <div className="card" style={{ marginTop: 'var(--space-lg)' }}>
              <div className="card-title" style={{ marginBottom: 'var(--space-md)' }}>
                🛠️ Next Steps
              </div>
              <ul style={{ 
                marginLeft: 'var(--space-lg)', 
                color: 'var(--color-text-secondary)',
                fontSize: 'var(--font-size-sm)',
                lineHeight: 1.8
              }}>
                <li>Set up iCloud, iMessage, and FaceTime (optional)</li>
                <li>Install your favorite apps from the App Store</li>
                <li>Check for macOS updates in System Settings</li>
                <li>Join the Hackintosh community for tips and updates</li>
                {macosVersion === 'sequoia' && (
                  <li>Launch HeliPort and add it to Login Items for auto-start</li>
                )}
              </ul>
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
