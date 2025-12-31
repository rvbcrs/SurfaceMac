import { useState } from 'react';
import { useWizard } from '../App';

// Local type definition (mirrors the global one for explicit typing)
interface USBDrive {
  id: string;
  name: string;
  size: string;
  path: string;
}

const UsbStep: React.FC = () => {
  const { nextStep, prevStep, platform, updateConfig } = useWizard();
  const [usbDrives, setUsbDrives] = useState<USBDrive[]>([
    // Mock data - will be replaced with real USB detection
    { id: 'disk2', name: 'SanDisk Ultra', size: '32 GB', path: '/dev/disk2' },
    { id: 'disk3', name: 'Kingston DataTraveler', size: '16 GB', path: '/dev/disk3' },
  ]);
  const [selectedUsb, setSelectedUsb] = useState<USBDrive | null>(null);
  const [isFormatting, setIsFormatting] = useState(false);
  const [formatComplete, setFormatComplete] = useState(false);

  const refreshDrives = async (): Promise<void> => {
    if (window.electronAPI) {
      const drives = await window.electronAPI.listUSBDrives();
      setUsbDrives(drives as USBDrive[]);
    }
  };

  const formatUsb = async (): Promise<void> => {
    if (!selectedUsb) return;
    
    setIsFormatting(true);
    
    // Simulate formatting
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // In real implementation:
    // if (window.electronAPI) {
    //   const format = platform === 'darwin' ? 'HFS+' : 'FAT32';
    //   await window.electronAPI.formatUSB(selectedUsb.path, format);
    // }
    
    setIsFormatting(false);
    setFormatComplete(true);
    updateConfig({ selectedUsb });
  };

  return (
    <>
      <header className="content-header">
        <h1 className="content-title">USB Preparation</h1>
        <p className="content-subtitle">
          Select and format your USB drive for the macOS installer.
        </p>
      </header>

      <div className="content-body fade-in">
        <div className="alert alert-warning">
          <div className="alert-icon">⚠️</div>
          <div className="alert-content">
            <div className="alert-title">Warning: Data Loss</div>
            <div className="alert-message">
              Formatting will erase ALL data on the selected USB drive. 
              Make sure you have backed up any important files.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-xl)' }}>
          <h3>Select USB Drive</h3>
          <button className="btn btn-ghost" onClick={refreshDrives}>
            🔄 Refresh
          </button>
        </div>

        <div className="usb-list">
          {usbDrives.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 'var(--space-2xl)' }}>
              <div style={{ fontSize: '48px', marginBottom: 'var(--space-md)' }}>💾</div>
              <div style={{ color: 'var(--color-text-muted)' }}>
                No USB drives detected. Please insert a USB drive (16GB+) and click Refresh.
              </div>
            </div>
          ) : (
            usbDrives.map((drive) => (
              <div
                key={drive.id}
                className={`usb-item ${selectedUsb?.id === drive.id ? 'selected' : ''}`}
                onClick={() => !isFormatting && !formatComplete && setSelectedUsb(drive)}
              >
                <div className="usb-icon">💾</div>
                <div className="usb-info">
                  <div className="usb-name">{drive.name}</div>
                  <div className="usb-details">{drive.size} • {drive.path}</div>
                </div>
                {selectedUsb?.id === drive.id && (
                  <div style={{ color: 'var(--color-accent-blue)' }}>✓</div>
                )}
              </div>
            ))
          )}
        </div>

        {selectedUsb && !formatComplete && (
          <div style={{ marginTop: 'var(--space-xl)' }}>
            <div className="card">
              <div className="card-header">
                <div className="card-icon">🔧</div>
                <div>
                  <div className="card-title">Format Settings</div>
                </div>
              </div>
              <div className="card-description">
                <strong>Drive:</strong> {selectedUsb.name} ({selectedUsb.size})<br />
                <strong>Format:</strong> {platform === 'darwin' ? 'Mac OS Extended (Journaled)' : 'FAT32'}<br />
                <strong>Scheme:</strong> GUID Partition Map
              </div>
              
              {isFormatting ? (
                <div style={{ marginTop: 'var(--space-lg)', display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                  <div className="spinner" />
                  <span>Formatting and copying files...</span>
                </div>
              ) : (
                <button 
                  className="btn btn-primary" 
                  style={{ marginTop: 'var(--space-lg)' }}
                  onClick={formatUsb}
                >
                  Format & Prepare USB
                </button>
              )}
            </div>
          </div>
        )}

        {formatComplete && (
          <div className="alert alert-success" style={{ marginTop: 'var(--space-xl)' }}>
            <div className="alert-icon">✅</div>
            <div className="alert-content">
              <div className="alert-title">USB Ready</div>
              <div className="alert-message">
                Your USB drive has been formatted and the EFI files have been copied.
                Continue to generate your unique SMBIOS data.
              </div>
            </div>
          </div>
        )}
      </div>

      <footer className="content-footer">
        <button className="btn btn-secondary" onClick={prevStep} disabled={isFormatting}>
          ← Back
        </button>
        <button 
          className="btn btn-primary" 
          onClick={nextStep}
          disabled={!formatComplete}
        >
          Next →
        </button>
      </footer>
    </>
  );
};

export default UsbStep;
