import { useState } from 'react';
import { useWizard } from '../App';

// Local type definition (mirrors the global one for explicit typing)
interface SMBIOSData {
  model: string;
  serial: string;
  mlb: string;
  uuid: string;
}

const SmbiosStep: React.FC = () => {
  const { nextStep, prevStep, updateConfig } = useWizard();
  const [isGenerating, setIsGenerating] = useState(false);
  const [smbios, setSmbios] = useState<SMBIOSData | null>(null);

  const generateSmbios = async (): Promise<void> => {
    setIsGenerating(true);
    
    try {
      let data: SMBIOSData;
      
      if (window.electronAPI) {
        // Use native Electron SMBIOS generator
        data = await window.electronAPI.generateSMBIOS('MacBookAir9,1');
      } else {
        // Browser fallback for development
        await new Promise(resolve => setTimeout(resolve, 500));
        data = {
          model: 'MacBookAir9,1',
          serial: 'C02' + Math.random().toString(36).substring(2, 10).toUpperCase(),
          mlb: 'C02' + Math.random().toString(36).substring(2, 15).toUpperCase(),
          uuid: crypto.randomUUID().toUpperCase(),
        };
      }
      
      setSmbios(data);
      updateConfig({ smbios: data });
    } catch (error) {
      console.error('Failed to generate SMBIOS:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const regenerate = (): void => {
    setSmbios(null);
    generateSmbios();
  };

  return (
    <>
      <header className="content-header">
        <h1 className="content-title">SMBIOS Generation</h1>
        <p className="content-subtitle">
          Generate unique serial numbers to identify your Hackintosh.
        </p>
      </header>

      <div className="content-body fade-in">
        <div className="alert alert-info">
          <div className="alert-icon">🔐</div>
          <div className="alert-content">
            <div className="alert-title">Why is this needed?</div>
            <div className="alert-message">
              macOS requires valid serial numbers for iCloud, iMessage, and FaceTime. 
              We generate unique values that won't conflict with real Apple devices.
            </div>
          </div>
        </div>

        {!smbios && !isGenerating && (
          <div style={{ textAlign: 'center', padding: 'var(--space-2xl)' }}>
            <div style={{ fontSize: '64px', marginBottom: 'var(--space-lg)' }}>🔑</div>
            <p style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--space-xl)' }}>
              Click the button below to generate your unique SMBIOS data.
            </p>
            <button className="btn btn-primary" onClick={generateSmbios}>
              Generate SMBIOS
            </button>
          </div>
        )}

        {isGenerating && (
          <div style={{ textAlign: 'center', padding: 'var(--space-2xl)' }}>
            <div className="spinner" style={{ margin: '0 auto var(--space-lg)' }} />
            <p style={{ color: 'var(--color-text-muted)' }}>
              Generating unique serial numbers...
            </p>
          </div>
        )}

        {smbios && (
          <div className="smbios-display">
            <div className="smbios-row">
              <span className="smbios-label">Model</span>
              <span className="smbios-value">{smbios.model}</span>
            </div>
            <div className="smbios-row">
              <span className="smbios-label">Serial Number</span>
              <span className="smbios-value">{smbios.serial}</span>
            </div>
            <div className="smbios-row">
              <span className="smbios-label">MLB (Board Serial)</span>
              <span className="smbios-value">{smbios.mlb}</span>
            </div>
            <div className="smbios-row">
              <span className="smbios-label">System UUID</span>
              <span className="smbios-value">{smbios.uuid}</span>
            </div>
          </div>
        )}

        {smbios && (
          <div style={{ marginTop: 'var(--space-xl)', display: 'flex', gap: 'var(--space-md)' }}>
            <button className="btn btn-ghost" onClick={regenerate}>
              🔄 Regenerate
            </button>
          </div>
        )}

        {smbios && (
          <div className="alert alert-success" style={{ marginTop: 'var(--space-xl)' }}>
            <div className="alert-icon">✅</div>
            <div className="alert-content">
              <div className="alert-title">SMBIOS Generated</div>
              <div className="alert-message">
                These values will be automatically injected into your config.plist in the next step.
              </div>
            </div>
          </div>
        )}
      </div>

      <footer className="content-footer">
        <button className="btn btn-secondary" onClick={prevStep}>
          ← Back
        </button>
        <button 
          className="btn btn-primary" 
          onClick={nextStep}
          disabled={!smbios}
        >
          Next →
        </button>
      </footer>
    </>
  );
};

export default SmbiosStep;
